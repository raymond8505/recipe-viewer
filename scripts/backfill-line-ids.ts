// One-shot, resumable backfill for stable ingredient-line ids.
//
//   yarn backfill:line-ids              # process every recipe missing ids
//   yarn backfill:line-ids --limit=10   # cap a pass (smoke-testing)
//   yarn backfill:line-ids --dry-run    # report only, write nothing
//
// Two writes per recipe, and they must agree:
//   1. mint an `id` on every schema ingredient line that lacks one
//   2. stamp the matching `line_id` on that line's existing recipe_ingredients
//      row, joined BY POSITION — the only correspondence that exists before
//      ids do, and the one the pre-0013 code was already relying on
//
// After this, associations survive rewording and reordering (see
// db/migrations/0013). Before it, they're still keyed on position/raw_text, so
// running this early is the point.
//
// Deliberately NOT going through updateRecipeRow: that mints ids too, but it
// also recomputes content + embedding (a Gemini call per recipe) and would
// schedule a normalization run for every recipe it touches, since gaining ids
// changes the line-id set. This writes metadata only. Idempotent — a recipe
// whose lines all have ids is skipped, so a re-run resumes.

import { withLineIds } from "@/lib/ingredientLines";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { RecipeIngredient, SchemaRecipe } from "@/types/recipe";

interface BackfillRow {
  id: string;
  name: string;
  // schema is absent on legacy/malformed rows — guarded before use.
  metadata: { schema?: SchemaRecipe } | null;
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

function needsIds(lines: SchemaRecipe["recipeIngredient"]): boolean {
  return (lines ?? []).some((line) => typeof line === "string" || line.id == null);
}

async function main(): Promise<void> {
  const limit = parseLimit();
  const dryRun = process.argv.includes("--dry-run");
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("recipes")
    .select("id, name, metadata")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`Failed to list recipes: ${error.message}`);
    process.exit(1);
  }

  const rows = (data ?? []) as unknown as BackfillRow[];
  const pending = rows.filter((row) => needsIds(row.metadata?.schema?.recipeIngredient));
  console.log(
    `${rows.length} recipes, ${pending.length} needing line ids${
      dryRun ? " (dry run)" : ""
    }`,
  );

  let done = 0;
  let rowsStamped = 0;
  for (const recipe of pending) {
    if (done >= limit) break;
    const schema = recipe.metadata!.schema!;
    const lines: RecipeIngredient[] = withLineIds(schema.recipeIngredient ?? []);

    if (dryRun) {
      console.log(`[dry] ${recipe.name} (${recipe.id}): ${lines.length} lines`);
      done += 1;
      continue;
    }

    const { error: writeError } = await supabase
      .from("recipes")
      .update({ metadata: { ...recipe.metadata, schema: { ...schema, recipeIngredient: lines } } })
      .eq("id", recipe.id);

    if (writeError) {
      console.error(`  ${recipe.id}: failed to write ids — ${writeError.message}`);
      continue;
    }

    // Stamp the derived rows by position. A recipe with no rows yet (never
    // normalized) simply has nothing to stamp.
    for (const [position, line] of lines.entries()) {
      const { error: stampError, count } = await supabase
        .from("recipe_ingredients")
        .update({ line_id: line.id }, { count: "exact" })
        .eq("recipe_id", recipe.id)
        .eq("position", position)
        .is("line_id", null);

      if (stampError) {
        console.error(
          `  ${recipe.id}: failed to stamp position ${position} — ${stampError.message}`,
        );
        continue;
      }
      rowsStamped += count ?? 0;
    }

    done += 1;
    console.log(`✓ ${recipe.name} (${recipe.id}): ${lines.length} lines`);
  }

  console.log(`Done: ${done} recipes, ${rowsStamped} derived rows stamped`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
