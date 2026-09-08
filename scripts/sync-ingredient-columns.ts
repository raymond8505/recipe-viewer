// One-shot drift sync between the blob's ingredient list and the columns.
//
//   yarn sync:ingredient-columns              # every drifted recipe
//   yarn sync:ingredient-columns --limit=10   # cap a pass (smoke-testing)
//   yarn sync:ingredient-columns --dry-run    # report only, write nothing
//
// `recipes.ingredients` + `recipe_ingredients` (db/migrations/0016) are the
// ingredient list from this build on, and `metadata.schema.recipeIngredient`
// is a dead key. The 0016 backfill populated the columns from the blob on
// 2026-09-03; any recipe edited through the pre-0016 build after that has a
// blob that moved on while its columns stayed put. This script brings those
// recipes' columns up to the blob, and it is the LAST reader of the dead key.
//
// Per recipe: the blob's lines become write input (grouped exactly as the app
// has always rendered them), each line names the row it already is by way of
// the 0013 `line_id` the blob line carries — the one remaining reader of that
// column too — and `reconcileRecipeIngredients` decides what to insert, update
// and delete. Text carry-over inside the reconcile covers lines that carry no
// id. A recipe whose reconcile changes nothing and whose stored groups already
// equal the column is skipped, so a second run does nothing.
//
// DETERMINISTIC ONLY. New rows land unmatched with a null ingredient_id; the
// matcher is never invoked (normalization is human-in-the-loop). Writes go in
// the same order updateRecipeRow uses — inserts, updates, the recipes row
// (the commit point), then deletes.

import { reconcileRecipeIngredients } from "@/lib/recipeIngredientReconcile";
import { fromSchemaOrgIngredients } from "@/lib/recipeIngredients";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { RecipeIngredientRow } from "@/types/ingredient";
import type {
  RecipeIngredientGroupInput,
  SchemaOrgIngredientLine,
  StoredIngredientGroup,
} from "@/types/recipe";

// The blob line as the pre-0016 build wrote it: `id` is the 0013 line_id.
type BlobLine = string | (SchemaOrgIngredientLine & { id?: string });

interface SyncRow {
  id: string;
  name: string;
  metadata: { schema?: { recipeIngredient?: BlobLine[] } } | null;
  ingredients: StoredIngredientGroup[];
}

// The row plus the dead column this script still reads.
type LegacyRow = RecipeIngredientRow & { line_id: string | null };

const LEGACY_ROW_COLUMNS =
  "id, recipe_id, ingredient_id, raw_text, quantity, unit, name_text, note, match_status, confidence, estimated_grams, grams_source, line_id";

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

/**
 * The blob's lines as write input, with each line naming its row where the
 * blob's line_id resolves to one. Grouping goes through the same
 * first-appearance rule the app uses, so the queue of ids is keyed by text —
 * repeated identical lines carry over positionally.
 */
function planInput(lines: BlobLine[], rows: LegacyRow[]): RecipeIngredientGroupInput[] {
  const rowByLineId = new Map(
    rows.filter((r) => r.line_id != null).map((r) => [r.line_id!, r]),
  );
  const idsByText = new Map<string, string[]>();
  for (const line of lines) {
    if (typeof line === "string" || line.id == null) continue;
    const row = rowByLineId.get(line.id);
    if (!row) continue;
    const text = line.name.trim();
    const queue = idsByText.get(text);
    if (queue) queue.push(row.id);
    else idsByText.set(text, [row.id]);
  }

  return fromSchemaOrgIngredients(lines).map((group) => ({
    ...group,
    ingredients: group.ingredients.map((line) => {
      const id = idsByText.get(line.raw_text)?.shift();
      return id != null ? { id, raw_text: line.raw_text } : line;
    }),
  }));
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

  const recipes = (data ?? []) as unknown as SyncRow[];
  console.log(`${recipes.length} recipes; scanning for drift${dryRun ? " (dry run)" : ""}`);

  let scanned = 0;
  let synced = 0;
  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  for (const recipe of recipes) {
    if (synced >= limit) break;
    scanned += 1;

    const { data: rowData, error: rowError } = await supabase
      .from("recipe_ingredients")
      .select(LEGACY_ROW_COLUMNS)
      .eq("recipe_id", recipe.id);

    if (rowError) {
      console.error(`  ${recipe.id}: failed to read rows — ${rowError.message}`);
      continue;
    }

    const rows = (rowData ?? []) as unknown as LegacyRow[];
    const lines = recipe.metadata?.schema?.recipeIngredient ?? [];
    const reconcile = reconcileRecipeIngredients(recipe.id, planInput(lines, rows), rows);

    const unchanged =
      !reconcile.lineSetChanged &&
      reconcile.updates.length === 0 &&
      JSON.stringify(reconcile.stored) === JSON.stringify(recipe.ingredients);
    if (unchanged) continue;

    const summary =
      `${recipe.name} (${recipe.id}): +${reconcile.inserts.length} row(s), ` +
      `~${reconcile.updates.length} reworded, -${reconcile.deleteIds.length} dropped, ` +
      `${reconcile.stored.length} group(s)`;

    if (dryRun) {
      console.log(`[dry] ${summary}`);
      synced += 1;
      continue;
    }

    if (reconcile.inserts.length > 0) {
      const { error: insertError } = await supabase
        .from("recipe_ingredients")
        .insert(reconcile.inserts);
      if (insertError) {
        console.error(`  ${recipe.id}: failed to insert rows — ${insertError.message}`);
        continue;
      }
    }

    if (reconcile.updates.length > 0) {
      const { error: updateError } = await supabase
        .from("recipe_ingredients")
        .upsert(reconcile.updates);
      if (updateError) {
        console.error(`  ${recipe.id}: failed to update rows — ${updateError.message}`);
        continue;
      }
    }

    const { error: writeError } = await supabase
      .from("recipes")
      .update({ ingredients: reconcile.stored })
      .eq("id", recipe.id);
    if (writeError) {
      console.error(`  ${recipe.id}: failed to write column — ${writeError.message}`);
      continue;
    }

    if (reconcile.deleteIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("recipe_ingredients")
        .delete()
        .eq("recipe_id", recipe.id)
        .in("id", reconcile.deleteIds);
      if (deleteError) {
        // The column does not name these rows, so they are orphans, not
        // content; report and carry on.
        console.error(`  ${recipe.id}: failed to prune rows — ${deleteError.message}`);
      }
    }

    synced += 1;
    inserted += reconcile.inserts.length;
    updated += reconcile.updates.length;
    deleted += reconcile.deleteIds.length;
    console.log(`✓ ${summary}`);
  }

  console.log(
    `Done: ${synced} recipe(s) synced of ${scanned} scanned; ` +
      `${inserted} rows inserted, ${updated} updated, ${deleted} deleted.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
