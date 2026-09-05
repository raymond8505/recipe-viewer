// One-shot, resumable backfill for db/migrations/0019's three time columns.
//
//   yarn backfill:recipe-times              # every un-backfilled recipe
//   yarn backfill:recipe-times --limit=10   # cap a pass (smoke-testing)
//   yarn backfill:recipe-times --dry-run    # report only, write nothing
//
// Copies each recipe's prepTime/cookTime/totalTime out of `metadata.schema`
// and into `recipes.prep_time`/`cook_time`/`total_time` as whole minutes. The
// metadata copies are deliberately LEFT IN PLACE — 0019 declares them dead
// rather than deleting them, and the repo layer overwrites them on read.
//
// Why a script and not SQL: it reuses isoToMinutes, so the backfill and the
// runtime agree on what counts as a parseable duration and on where the
// minute boundary rounds. An ISO-8601 regex rewritten in PL/pgSQL is exactly
// where that agreement would drift.
//
// UNPARSEABLE VALUES ARE REPORTED, NEVER GUESSED. `parseDurationToSeconds`
// only accepts `PT[h]H[m]M[s]S`, so day-bearing durations ("P4D",
// "P1DT13H20M") and human text ("20–22 min") fall through with the column
// left NULL. There were 4 such values across 576 recipes when this was
// written, all listed at the end of the run: fixing them by hand in the
// editor is now possible, which is the other half of what 0019 shipped.
//
// Idempotent: a recipe whose three columns are already populated to the value
// its schema implies is skipped, so a re-run resumes where an interrupted
// pass stopped and a second full pass writes nothing.

import { isIsoDuration, isoToMinutes } from "@/lib/format";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { SchemaRecipe } from "@/types/recipe";

interface BackfillRow {
  id: string;
  name: string | null;
  prep_time: number | null;
  cook_time: number | null;
  total_time: number | null;
  // schema is absent on legacy/malformed rows — guarded before use.
  metadata: { schema?: SchemaRecipe } | null;
}

/** The schema key each column is filled from. */
const TIME_FIELDS = [
  ["prepTime", "prep_time"],
  ["cookTime", "cook_time"],
  ["totalTime", "total_time"],
] as const;

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

interface Planned {
  columns: { prep_time: number | null; cook_time: number | null; total_time: number | null };
  /** Schema values the parser rejected, so the run can report them. */
  unparseable: Array<{ field: string; value: string }>;
  changed: boolean;
}

/** Work out a row's column values without writing anything. */
function plan(row: BackfillRow): Planned {
  const schema = row.metadata?.schema;
  const columns = { prep_time: row.prep_time, cook_time: row.cook_time, total_time: row.total_time };
  const unparseable: Planned["unparseable"] = [];
  let changed = false;

  for (const [key, column] of TIME_FIELDS) {
    const raw = schema?.[key];
    const minutes = isoToMinutes(raw);
    // A value we cannot READ is one we would drop on the floor — surface it.
    // A well-formed zero ("PT0M" on a no-cook dressing) is not that: it is the
    // recipe saying it has no cook time, and NULL records exactly that.
    if (typeof raw === "string" && raw.trim() !== "" && !isIsoDuration(raw)) {
      unparseable.push({ field: key, value: raw });
    }
    if (minutes !== null && minutes !== columns[column]) {
      columns[column] = minutes;
      changed = true;
    }
  }

  return { columns, unparseable, changed };
}

async function main() {
  const limit = parseLimit();
  const dryRun = process.argv.includes("--dry-run");
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("recipes")
    .select("id, name, prep_time, cook_time, total_time, metadata")
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
    `${rows.length} recipes total; ${pending.length} with times to promote; processing ${target}${dryRun ? " (dry run)" : ""}.`,
  );

  let written = 0;
  for (let i = 0; i < target; i++) {
    const { row, planned } = pending[i];
    const summary = TIME_FIELDS.map(([, c]) => `${c}=${planned.columns[c] ?? "—"}`).join(" ");
    console.log(`[${i + 1}/${target}] ${row.id} ${row.name ?? "(unnamed)"} → ${summary}`);
    if (dryRun) continue;

    const { error: updateError } = await supabase
      .from("recipes")
      .update(planned.columns)
      .eq("id", row.id);

    // One bad row must not abandon the other 575 — the pass is resumable, so
    // a failure here is simply picked up by the next run.
    if (updateError) console.error(`  failed: ${updateError.message}`);
    else written++;
  }

  // Reported for every row, not just the processed ones: a value the parser
  // rejects never makes a row "pending", so it would otherwise be invisible.
  const rejected = plans.filter((p) => p.planned.unparseable.length > 0);
  if (rejected.length > 0) {
    console.log(`\n${rejected.length} recipe(s) with a duration the parser rejected — columns left NULL:`);
    for (const { row, planned } of rejected) {
      for (const { field, value } of planned.unparseable) {
        console.log(`  ${row.id} ${row.name ?? "(unnamed)"} — ${field}: ${JSON.stringify(value)}`);
      }
    }
    console.log("Fix these in the recipe editor; the columns will be written on save.");
  }

  console.log(`\nBackfill pass complete: ${written} row(s) written${dryRun ? " (dry run — nothing written)" : ""}.`);
}

void main();
