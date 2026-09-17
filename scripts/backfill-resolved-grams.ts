// One-shot, resumable backfill for db/migrations/0024's `resolved_grams`.
//
//   yarn backfill:resolved-grams              # every line whose value is stale
//   yarn backfill:resolved-grams --limit=500  # cap a pass (smoke-testing)
//   yarn backfill:resolved-grams --dry-run    # report only, write nothing
//
// Stamps each `recipe_ingredients` row with what its line weighs, so recipe
// search can rank an ingredient match by the share of the recipe it accounts
// for. New and edited lines get the value at their write (the two chokepoints
// in src/lib/ingredients.ts); this is the one pass for the rows that predate
// the column.
//
// Why a script and not SQL: it calls `resolveLineGrams`, the same resolver the
// nutrition math and the write path use, so the backfill cannot disagree with
// the runtime about what a line weighs. Re-deriving the unit table and the
// "(14 oz)" text parse in PL/pgSQL is exactly where that would drift.
//
// NOTHING HERE GUESSES. A line the resolver cannot weigh — a count with no
// density, "salt to taste" — is written NULL, which search reads as "no
// weight", never as 0 g. Zero keeps its own meaning: a curator's "don't count
// this line" (nutrition.md), and it round-trips unchanged.
//
// Idempotent: a row already holding what the resolver returns is skipped, so a
// second full pass writes nothing and an interrupted one resumes.

import { getIngredientsByIds } from "@/lib/ingredients";
import { resolveLineGrams } from "@/lib/nutritionMath";
import { getSupabaseAdminClient } from "@/lib/supabase";

// PostgREST's own response cap; reading in exactly this stride means the
// short page is the reliable end-of-data signal.
const READ_PAGE = 1000;

interface LineRow {
  id: string;
  recipe_id: string;
  ingredient_id: string | null;
  raw_text: string;
  quantity: number | null;
  unit: string | null;
  estimated_grams: number | null;
  resolved_grams: number | null;
}

// Two values are the same weight if they agree to the milligram — the column
// is numeric and the resolver returns a float, so an exact === would rewrite
// every row forever on the round trip.
function sameGrams(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) < 1e-3;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

  const db = getSupabaseAdminClient();

  // Paged: PostgREST caps a response at 1,000 rows and says so only by
  // returning exactly that many, so an unpaged read would silently backfill
  // the first page and report the rest as done.
  const rows: LineRow[] = [];
  for (let from = 0; ; from += READ_PAGE) {
    const { data, error } = await db
      .from("recipe_ingredients")
      .select(
        "id, recipe_id, ingredient_id, raw_text, quantity, unit, estimated_grams, resolved_grams",
      )
      .order("id", { ascending: true })
      .range(from, from + READ_PAGE - 1);
    if (error) {
      console.error(`Could not read recipe_ingredients: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    const page = (data ?? []) as LineRow[];
    rows.push(...page);
    if (page.length < READ_PAGE) break;
  }

  // One catalog read for the whole run: a volume line needs its ingredient's
  // density, and the catalog is small next to the line count.
  const ids = [...new Set(rows.map((r) => r.ingredient_id).filter((id): id is string => !!id))];
  const density = new Map(
    (await getIngredientsByIds(ids)).map((i) => [i.id, i.density_g_per_ml]),
  );

  let weighed = 0;
  let unweighable = 0;
  let written = 0;
  const pending: Array<{ row: LineRow; grams: number | null }> = [];

  for (const row of rows) {
    const grams = resolveLineGrams(
      row,
      row.ingredient_id ? (density.get(row.ingredient_id) ?? null) : null,
    ).grams;
    if (grams == null) unweighable++;
    else weighed++;
    if (!sameGrams(grams, row.resolved_grams)) pending.push({ row, grams });
  }

  console.log(
    `${rows.length} line(s): ${weighed} weighable, ${unweighable} not. ${pending.length} to write.`,
  );

  for (const { row, grams } of pending.slice(0, limit)) {
    if (dryRun) {
      written++;
      continue;
    }
    const { error: updateError } = await db
      .from("recipe_ingredients")
      .update({ resolved_grams: grams })
      .eq("id", row.id);
    if (updateError) console.error(`  ${row.id} failed: ${updateError.message}`);
    else written++;
  }

  console.log(
    `\nBackfill pass complete: ${written} row(s) written${dryRun ? " (dry run — nothing written)" : ""}.`,
  );
}

void main();
