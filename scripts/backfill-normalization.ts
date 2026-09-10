// One-shot, resumable ingredient-normalization backfill.
//
//   yarn backfill:normalization              # process everything pending
//   yarn backfill:normalization --limit=10   # cap a pass (smoke-testing)
//
// A recipe is pending when its stored normalized_fingerprint doesn't match the
// fingerprint of its CURRENT lines — `recipes.ingredients` joined to its
// `recipe_ingredients` rows, never the blob (covers never-normalized, failed,
// and stale rows; runNormalization only writes the fingerprint on a completed
// run, so re-running this script naturally resumes where the last pass left
// off).
//
// Normalization is human-in-the-loop: this exists for recovery passes, not for
// bulk-guessing the whole catalog. Sequential with a fixed delay: the only USDA
// spend is novel-ingredient lookups (~2 requests each, 1,000/hr budget), and
// early passes are novel-heavy by definition. Runs outside a request scope on
// purpose — it calls runNormalization directly, not the trigger.

import { getRecipeIngredientsByRecipeIds } from "@/lib/ingredients";
import { ingredientFingerprint } from "@/lib/normalization/fingerprint";
import { runNormalization } from "@/lib/normalization/graph";
import { hydrateIngredientGroups, ingredientTexts } from "@/lib/recipeIngredients";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { StoredIngredientGroup } from "@/types/recipe";

const DELAY_MS = 3_000;

interface BackfillRow {
  id: string;
  normalized_fingerprint: string | null;
  ingredients: StoredIngredientGroup[];
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

async function main() {
  const limit = parseLimit();
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("recipes")
    .select("id, normalized_fingerprint, ingredients")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to list recipes:", error.message);
    process.exit(1);
  }

  const rows = (data as unknown as BackfillRow[]) ?? [];
  const rowsByRecipe = await getRecipeIngredientsByRecipeIds(rows.map((r) => r.id));

  const pending = rows.filter((row) => {
    const texts = ingredientTexts(
      hydrateIngredientGroups(row.ingredients, rowsByRecipe.get(row.id) ?? []),
    );
    return row.normalized_fingerprint !== ingredientFingerprint(texts);
  });
  const target = Math.min(pending.length, limit);

  console.log(
    `${rows.length} recipes total; ${pending.length} pending normalization; processing ${target}.`,
  );

  for (let i = 0; i < target; i++) {
    const row = pending[i];
    console.log(`[${i + 1}/${target}] normalizing ${row.id}…`);
    // Never throws — failures land as normalization_status="failed" on the
    // row and are retried by the next pass.
    await runNormalization(row.id);
    if (i < target - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log(`Backfill pass complete: ${target} processed.`);
}

void main();
