// One-shot, resumable ingredient-normalization backfill.
//
//   yarn backfill:normalization              # process everything pending
//   yarn backfill:normalization --limit=10   # cap a pass (smoke-testing)
//
// A recipe is pending when its stored normalized_fingerprint doesn't match the
// fingerprint of its CURRENT lines (covers never-normalized, failed, and stale
// rows — runNormalization only writes the fingerprint on a completed run, so
// re-running this script naturally resumes where the last pass left off).
//
// "Current" means the composed recipe (recipeFingerprint → composeRecipeSchema),
// never metadata.schema: since db/migrations/0016 the line text lives on the
// recipe_ingredients rows, and the blob's own recipeIngredient is a frozen
// pre-migration copy on every backfilled row. Hashing that copy silently
// selects the wrong set. Each recipe is fetched through getRecipeById on its
// turn rather than in one bulk query — a single .in() over every recipe id
// would exceed the PostgREST URL limit, and the rows for all of them would
// exceed its 1,000-row page.
//
// Normalization is human-in-the-loop: this exists for recovery passes, not for
// bulk-guessing the whole catalog. Sequential with a fixed delay: the only USDA
// spend is novel-ingredient lookups (~2 requests each, 1,000/hr budget), and
// early passes are novel-heavy by definition. Runs outside a request scope on
// purpose — it calls runNormalization directly, not the trigger.

import { recipeFingerprint } from "@/lib/normalization/fingerprint";
import { runNormalization } from "@/lib/normalization/graph";
import { getRecipeById } from "@/lib/recipes";
import { getSupabaseAdminClient } from "@/lib/supabase";

const DELAY_MS = 3_000;

interface BackfillRow {
  id: string;
  normalized_fingerprint: string | null;
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
    .select("id, normalized_fingerprint")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to list recipes:", error.message);
    process.exit(1);
  }

  const rows = (data as unknown as BackfillRow[]) ?? [];
  console.log(`${rows.length} recipes total; scanning for stale fingerprints…`);

  // Lazy: staleness is decided one recipe at a time so a --limit pass stops as
  // soon as it has done its N, instead of fetching all 500+ recipes up front.
  let scanned = 0;
  let processed = 0;
  for (const row of rows) {
    if (processed >= limit) break;
    scanned++;

    const recipe = await getRecipeById(row.id);
    if (!recipe) continue; // deleted between the listing and now
    if (row.normalized_fingerprint === recipeFingerprint(recipe)) continue;

    if (processed > 0) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
    processed++;
    console.log(`[${processed}] normalizing ${row.id}…`);
    // Never throws — failures land as normalization_status="failed" on the
    // row and are retried by the next pass.
    await runNormalization(row.id);
  }

  console.log(
    `Backfill pass complete: ${processed} processed (${scanned} of ${rows.length} scanned).`,
  );
}

void main();
