// One-shot, resumable backfill for db/migrations/0016's two columns.
//
//   yarn backfill:ingredient-columns              # every un-backfilled recipe
//   yarn backfill:ingredient-columns --limit=10   # cap a pass (smoke-testing)
//   yarn backfill:ingredient-columns --dry-run    # report only, write nothing
//
// Moves each recipe's ingredient lines and instruction steps out of
// `metadata.schema` and into `recipes.ingredients` / `recipes.instructions`.
// The metadata copy is deliberately LEFT IN PLACE — the currently-deployed
// build still reads it, and it stays the fallback until 0018 strips it.
//
// Two writes per recipe:
//   1. materialize a recipe_ingredients row for every line that hasn't got one
//   2. write the group array (ids, in order) + the instructions column
//
// Why a script and not SQL: the instructions column needs
// `normalizeRecipeInstructions` (a handful of recipes store a bare markdown
// string, which `markdownToInstructions` has to split into steps), and new rows
// need `parseLineDeterministic` to fill quantity/unit/name_text. Neither is
// expressible in a migration.
//
// DETERMINISTIC ONLY. New rows land as `match_status: "unmatched"` with a null
// `ingredient_id`; the matcher is never invoked. Normalization is
// human-in-the-loop, and bulk-guessing catalog associations for every recipe at
// once is exactly what that rule exists to prevent — curation happens per
// recipe, as it already did.
//
// An already-normalized recipe keeps its rows: a line is matched to its
// existing row by `line_id` when it has one and by `position` otherwise (the
// only correspondence that exists for pre-0013 rows), so `ingredient_id`,
// `match_status`, `confidence` and `estimated_grams` all survive. This is the
// last use of either column — it must run BEFORE 0018 drops them.
//
// Idempotent: a recipe whose `ingredients` is already non-empty is skipped, so
// a re-run resumes where an interrupted pass stopped.

import { getIngredientText, normalizeRecipeInstructions } from "@/lib/format";
import { parseLineDeterministic } from "@/lib/normalization/parseLine";
import { toIngredientGroups } from "@/lib/recipeSchema";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { RecipeIngredientRow } from "@/types/ingredient";
import type { RecipeIngredientGroup, SchemaRecipe } from "@/types/recipe";

interface BackfillRow {
  id: string;
  name: string;
  // schema is absent on legacy/malformed rows — guarded before use.
  metadata: { schema?: SchemaRecipe } | null;
  ingredients: RecipeIngredientGroup[];
}

function parseLimit(): number {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  if (!arg) return Number.POSITIVE_INFINITY;
  const value = Number(arg.split("=")[1]);
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`Invalid --limit value: ${arg}`);
    process.exit(1);
  }
  return value;
}

/** New rows carry `position` only to satisfy the not-yet-dropped column. */
type NewRow = Omit<RecipeIngredientRow, "line_id"> & { line_id: null };

interface Planned {
  groups: RecipeIngredientGroup[];
  newRows: NewRow[];
  reusedCount: number;
}

/**
 * Work out this recipe's group array and any rows that have to be created,
 * without writing anything.
 *
 * A line claims an existing row by `line_id` first — that is what 0013 made the
 * identity — and falls back to `position` for rows written before it. Whichever
 * way it is found, the row's id becomes the line's id from here on.
 */
function plan(recipe: BackfillRow, existing: RecipeIngredientRow[]): Planned {
  const lines = recipe.metadata?.schema?.recipeIngredient ?? [];
  const byLineId = new Map(
    existing.filter((r) => r.line_id != null).map((r) => [r.line_id!, r]),
  );
  const byPosition = new Map(existing.map((r) => [r.position, r]));
  const claimed = new Set<string>();

  const newRows: NewRow[] = [];
  let reusedCount = 0;

  const grouped = lines.map((line, index) => {
    const text = getIngredientText(line);
    const lineId = typeof line === "string" ? undefined : line.id;
    const match =
      (lineId != null ? byLineId.get(lineId) : undefined) ?? byPosition.get(index);
    const row = match && !claimed.has(match.id) ? match : undefined;

    if (row) {
      claimed.add(row.id);
      reusedCount += 1;
    } else {
      const parsed = parseLineDeterministic(text, index);
      newRows.push({
        id: crypto.randomUUID(),
        recipe_id: recipe.id,
        line_id: null,
        ingredient_id: null,
        raw_text: text,
        quantity: parsed.quantity,
        unit: parsed.unit,
        name_text: parsed.name,
        note: parsed.note,
        match_status: "unmatched",
        confidence: null,
        position: index,
        estimated_grams: null,
        grams_source: null,
      });
    }

    return {
      ...(typeof line === "string" || line.group == null ? {} : { group: line.group }),
      id: row ? row.id : newRows[newRows.length - 1].id,
    };
  });

  return { groups: toIngredientGroups(grouped), newRows, reusedCount };
}

async function main(): Promise<void> {
  const limit = parseLimit();
  const dryRun = process.argv.includes("--dry-run");
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("recipes")
    .select("id, name, metadata, ingredients")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`Failed to list recipes: ${error.message}`);
    process.exit(1);
  }

  const rows = (data ?? []) as unknown as BackfillRow[];
  const pending = rows.filter((row) => (row.ingredients ?? []).length === 0);
  const noSchema = pending.filter((row) => !row.metadata?.schema);
  if (noSchema.length > 0) {
    console.warn(
      `Skipping ${noSchema.length} recipe(s) with no metadata.schema: ${noSchema
        .map((r) => r.id)
        .join(", ")}`,
    );
  }

  const work = pending.filter((row) => row.metadata?.schema);
  console.log(
    `${rows.length} recipes, ${work.length} to backfill${dryRun ? " (dry run)" : ""}`,
  );

  let done = 0;
  let created = 0;
  let reused = 0;
  let emptied = 0;

  for (const recipe of work) {
    if (done >= limit) break;

    const { data: rowData, error: rowError } = await supabase
      .from("recipe_ingredients")
      .select("*")
      .eq("recipe_id", recipe.id);

    if (rowError) {
      console.error(`  ${recipe.id}: failed to read rows — ${rowError.message}`);
      continue;
    }

    const existing = (rowData ?? []) as unknown as RecipeIngredientRow[];
    const { groups, newRows, reusedCount } = plan(recipe, existing);
    const instructions =
      normalizeRecipeInstructions(recipe.metadata!.schema!.recipeInstructions) ?? [];

    if (groups.length === 0) emptied += 1;

    if (dryRun) {
      console.log(
        `[dry] ${recipe.name} (${recipe.id}): ${groups.length} group(s), ` +
          `${newRows.length} new row(s), ${reusedCount} reused, ` +
          `${instructions.length} step(s)`,
      );
      done += 1;
      created += newRows.length;
      reused += reusedCount;
      continue;
    }

    // Rows first: the group array about to be written names them, so a failure
    // here leaves the recipe un-backfilled rather than pointing at nothing.
    if (newRows.length > 0) {
      const { error: insertError } = await supabase
        .from("recipe_ingredients")
        .insert(newRows);

      if (insertError) {
        console.error(`  ${recipe.id}: failed to insert rows — ${insertError.message}`);
        continue;
      }
    }

    const { error: writeError } = await supabase
      .from("recipes")
      .update({ ingredients: groups, instructions })
      .eq("id", recipe.id);

    if (writeError) {
      console.error(`  ${recipe.id}: failed to write columns — ${writeError.message}`);
      continue;
    }

    done += 1;
    created += newRows.length;
    reused += reusedCount;
    console.log(
      `✓ ${recipe.name} (${recipe.id}): ${groups.length} group(s), ` +
        `+${newRows.length} row(s), ${reusedCount} reused, ${instructions.length} step(s)`,
    );
  }

  console.log(
    `Done: ${done} recipes, ${created} rows created, ${reused} rows reused, ` +
      `${emptied} with no ingredient lines`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
