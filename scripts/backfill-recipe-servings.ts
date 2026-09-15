// One-shot, resumable backfill for db/migrations/0022's four servings columns.
//
//   yarn backfill:recipe-servings              # every un-backfilled recipe
//   yarn backfill:recipe-servings --limit=10   # cap a pass (smoke-testing)
//   yarn backfill:recipe-servings --dry-run    # report only, write nothing
//
// Reduces each recipe's `metadata.schema.recipeYield` to
// `recipes.servings_amount` / `servings_unit` / `total_weight_amount` /
// `total_weight_unit`. The metadata copies are deliberately LEFT IN PLACE —
// 0022 declares them dead rather than deleting them, and the repo layer deletes
// them at the read exit and strips them from every write.
//
// Why a script and not SQL: it reuses parseYield, so the backfill and the
// runtime agree on exactly what counts as a parseable yield. A regex rewritten
// in PL/pgSQL is precisely where that agreement would drift.
//
// NOTHING HERE GUESSES. A recipe whose yield the parser rejects keeps NULL
// columns and gets listed; a recipe whose rendered label differs from what its
// yield string said gets listed too, because that difference is visible on the
// page. Three report buckets, none of them fatal:
//
//   REJECTED       parseYield found no anchored amount ("Not specified", "",
//                  "Enough for one 350g brick of tofu") or a QuantitativeValue
//                  with no numeric value. Columns stay NULL. Also covers a
//                  yield whose valueReference names a non-metric unit: the
//                  servings pair still lands, the weight columns stay NULL.
//   LOSSY          The columns render a different label than the yield string
//                  did — a collapsed range ("6-8 servings" → "7 servings"), a
//                  dropped parenthetical, a bare number gaining the fallback
//                  unit ("9" → "9 servings").
//   SERVING SIZE   `nutrition.servingSize` said something the columns cannot
//                  reconstruct. The wire regenerates "1 <singular unit>", which
//                  reproduces most of them exactly; "100ml" against a "300ml"
//                  yield does not, and whether that recipe means "3 servings of
//                  100 ml" is exactly the guess this refuses to make.
//
// The derived `content` column is NOT refreshed (0019's backfill didn't either),
// so a recipe's embedded markdown keeps its old Yield line until it is next
// saved through the repo layer.
//
// Idempotent: a recipe whose columns already hold what its yield implies is
// skipped, and a rejected row is never pending, so it cannot loop. A re-run
// resumes where an interrupted pass stopped and a second full pass writes
// nothing.

import { formatServings, singularServingUnit } from "@/lib/format";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { parseYield } from "@/lib/units";
import type { SchemaOrgRecipe } from "@/types/recipe";

interface BackfillRow {
  id: string;
  name: string | null;
  servings_amount: number | null;
  servings_unit: string | null;
  total_weight_amount: number | null;
  total_weight_unit: string | null;
  // schema is absent on legacy/malformed rows — guarded before use.
  metadata: { schema?: SchemaOrgRecipe } | null;
}

interface Columns {
  servings_amount: number | null;
  servings_unit: string | null;
  total_weight_amount: number | null;
  total_weight_unit: string | null;
}

interface Planned {
  columns: Columns;
  changed: boolean;
  /** The yield string the parser refused, so the run can report it. */
  rejected: string | null;
  /** The label the columns render, when it differs from what the yield said. */
  lossy: { from: string; to: string } | null;
  /** A servingSize the columns cannot reconstruct. */
  servingSize: { stored: string; derived: string } | null;
}

/** How a yield reads back to a human, for the lossy comparison. */
function yieldText(raw: SchemaOrgRecipe["recipeYield"]): string | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    // The structured form IS the columns, so it can never render differently.
    return null;
  }
  const text = Array.isArray(raw) ? raw[0] : raw;
  return text?.trim() || null;
}

/** Case- and whitespace-insensitive, so "1 Serving" matches "1 serving". */
function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase().replace(/\s+/g, " ") ===
    b.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Work out a row's column values without writing anything. */
function plan(row: BackfillRow): Planned {
  const schema = row.metadata?.schema;
  const raw = schema?.recipeYield;
  const parsed = parseYield(raw);
  const current: Columns = {
    servings_amount: row.servings_amount,
    servings_unit: row.servings_unit,
    total_weight_amount: row.total_weight_amount,
    total_weight_unit: row.total_weight_unit,
  };

  if (!parsed) {
    const text = yieldText(raw);
    return {
      columns: current,
      changed: false,
      // An absent yield is not a rejection — the recipe simply never had one.
      rejected: text,
      lossy: null,
      servingSize: null,
    };
  }

  const columns: Columns = {
    servings_amount: parsed.amount,
    servings_unit: parsed.unit,
    total_weight_amount: parsed.weight?.amount ?? null,
    total_weight_unit: parsed.weight?.unit ?? null,
  };
  const changed = (Object.keys(columns) as Array<keyof Columns>).some(
    (k) => columns[k] !== current[k],
  );

  // A structured yield carrying a non-metric weight loses only its weight half.
  const droppedWeight =
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    raw?.valueReference != null &&
    parsed.weight === null
      ? `valueReference unit ${JSON.stringify(raw.valueReference.unitText ?? "")} is not metric`
      : null;

  const source = yieldText(raw);
  const rendered = formatServings(columns.servings_amount, columns.servings_unit);
  const lossy =
    source && rendered && !sameText(source, rendered)
      ? { from: source, to: rendered }
      : null;

  const stored = schema?.nutrition?.servingSize?.trim();
  const derived = `1 ${singularServingUnit(columns.servings_unit)}`;
  const servingSize =
    stored && !sameText(stored, derived) ? { stored, derived } : null;

  return {
    columns,
    changed,
    rejected: droppedWeight,
    lossy,
    servingSize,
  };
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

function label(row: BackfillRow): string {
  return `${row.id} ${row.name ?? "(unnamed)"}`;
}

async function main() {
  const limit = parseLimit();
  const dryRun = process.argv.includes("--dry-run");
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id, name, servings_amount, servings_unit, total_weight_amount, total_weight_unit, metadata",
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to list recipes:", error.message);
    process.exit(1);
  }

  const rows = (data as unknown as BackfillRow[]) ?? [];
  const plans = rows.map((row) => ({ row, planned: plan(row) }));
  const pending = plans.filter((p) => p.planned.changed);
  const target = Math.min(pending.length, limit);

  console.log(
    `${rows.length} recipes total; ${pending.length} with servings to promote; processing ${target}${dryRun ? " (dry run)" : ""}.`,
  );

  let written = 0;
  for (let i = 0; i < target; i++) {
    const { row, planned } = pending[i];
    const { servings_amount: a, servings_unit: u } = planned.columns;
    const weight =
      planned.columns.total_weight_amount != null
        ? ` (${planned.columns.total_weight_amount} ${planned.columns.total_weight_unit})`
        : "";
    console.log(`[${i + 1}/${target}] ${label(row)} → ${a} ${u ?? "—"}${weight}`);
    if (dryRun) continue;

    const { error: updateError } = await supabase
      .from("recipes")
      .update(planned.columns)
      .eq("id", row.id);

    // One bad row must not abandon the rest — the pass is resumable, so a
    // failure here is simply picked up by the next run.
    if (updateError) console.error(`  failed: ${updateError.message}`);
    else written++;
  }

  // Reported over every row, not just the processed ones: a rejected yield
  // never makes a row "pending", so only a full scan surfaces it.
  const rejected = plans.filter((p) => p.planned.rejected);
  if (rejected.length > 0) {
    console.log(
      `\n${rejected.length} recipe(s) with a yield the parser refused — columns left NULL:`,
    );
    for (const { row, planned } of rejected) {
      console.log(`  ${label(row)} — ${JSON.stringify(planned.rejected)}`);
    }
    console.log("Set these in the recipe editor, or through MCP update_recipe.");
  }

  const lossy = plans.filter((p) => p.planned.lossy);
  if (lossy.length > 0) {
    console.log(
      `\n${lossy.length} recipe(s) whose yield now renders differently — check these:`,
    );
    for (const { row, planned } of lossy) {
      console.log(
        `  ${label(row)} — ${JSON.stringify(planned.lossy!.from)} → ${JSON.stringify(planned.lossy!.to)}`,
      );
    }
  }

  const sizes = plans.filter((p) => p.planned.servingSize);
  if (sizes.length > 0) {
    console.log(
      `\n${sizes.length} recipe(s) whose nutrition.servingSize the columns cannot reconstruct:`,
    );
    for (const { row, planned } of sizes) {
      console.log(
        `  ${label(row)} — stored ${JSON.stringify(planned.servingSize!.stored)}, published ${JSON.stringify(planned.servingSize!.derived)}`,
      );
    }
    console.log(
      "Nothing renders the stored text; decide per recipe whether the count or the unit is wrong.",
    );
  }

  console.log(
    `\nBackfill pass complete: ${written} row(s) written${dryRun ? " (dry run — nothing written)" : ""}.`,
  );
}

void main();
