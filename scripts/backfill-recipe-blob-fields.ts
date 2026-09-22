// One-shot, resumable backfill for db/migrations/0026's four promoted columns.
//
//   yarn backfill:recipe-blob-fields              # every un-backfilled recipe
//   yarn backfill:recipe-blob-fields --limit=10   # cap a pass (smoke-testing)
//   yarn backfill:recipe-blob-fields --dry-run    # report only, write nothing
//
// Copies `metadata.schema.{image,description,notes,cookingNotes}` into
// `recipes.{image,description,notes,cooking_notes}`. The blob copies are
// deliberately LEFT IN PLACE — 0026 declares them dead rather than deleting
// them, and the repo layer deletes them at the read exit and strips them from
// every write.
//
// FILL-ONLY, and that is the whole safety argument. A column that already holds
// something is never overwritten, so this stays correct no matter when it runs:
// before the write path starts filling the columns, after it, or after the read
// switch has begun stripping the promoted keys from the blob entirely. The
// alternative — "the blob wins" — is right for exactly one window and silently
// reverts a freshly saved recipe to a stale blob value outside it.
//
// NAME IS REPORTED, NEVER WRITTEN. Every row already has a name column (the app
// has written it on every create and every name patch for as long as the column
// has existed), so there is nothing to fill. What matters is whether it agrees
// with the blob the app has been READING until now, because that is the value
// about to disappear from view. A disagreement is a human decision — one row
// has a good column name against a NULL blob name, which is the opposite of the
// direction a "reconcile" would have assumed — so the run prints them and
// writes neither.
//
// A row with no name in either place is reported separately: 0027 puts NOT NULL
// on the column and such a row would block it.
//
// The derived `content` column is NOT refreshed (0019's and 0022's backfills
// didn't either), so a recipe's embedded markdown is unchanged — none of these
// fields except the name appears in it, and the name is not being changed.
//
// Idempotent: a second full pass writes nothing.

import { getFirstImage } from "@/lib/format";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { SchemaRecipe } from "@/types/recipe";

/** The blob as it stands BEFORE the promotion — the keys this script reads are
 *  the ones `SchemaRecipe` is about to lose, so they are spelled out here
 *  rather than taken from the type, which would stop compiling in step 3. */
type PrePromotionSchema = SchemaRecipe & {
  name?: string;
  image?: string | string[];
  description?: string;
  notes?: string;
  cookingNotes?: string;
};

interface BackfillRow {
  id: string;
  name: string | null;
  image: string | null;
  description: string | null;
  notes: string | null;
  cooking_notes: string | null;
  // schema is absent on legacy/malformed rows — guarded before use.
  metadata: { schema?: PrePromotionSchema } | null;
}

interface Columns {
  image: string | null;
  description: string | null;
  notes: string | null;
  cooking_notes: string | null;
}

interface Planned {
  /** Only the columns that actually change; empty when there is nothing to do. */
  columns: Partial<Columns>;
  changed: boolean;
  /** Column and blob disagree about the name — for a human, not for a write. */
  nameDiverged: { column: string | null; blob: string | null } | null;
  /** No name in either place; 0027's NOT NULL would reject this row. */
  nameMissing: boolean;
  /** The blob held a `string[]` image, reduced to its first entry. */
  imageWasArray: boolean;
}

/** A blob value worth copying: present, a string, and not just whitespace. */
function blobText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** True when the column has nothing in it — the only case this script fills. */
function isEmpty(value: string | null): boolean {
  return value === null || value.trim() === "";
}

/** Work out a row's column values without writing anything. */
function plan(row: BackfillRow): Planned {
  const schema = row.metadata?.schema;
  const columns: Partial<Columns> = {};

  const candidates: Array<[keyof Columns, string | null]> = [
    ["image", getFirstImage(schema?.image)?.trim() || null],
    ["description", blobText(schema?.description)],
    ["notes", blobText(schema?.notes)],
    ["cooking_notes", blobText(schema?.cookingNotes)],
  ];
  for (const [column, value] of candidates) {
    if (value !== null && isEmpty(row[column])) columns[column] = value;
  }

  const blobName = blobText(schema?.name);
  const columnName = blobText(row.name);
  return {
    columns,
    changed: Object.keys(columns).length > 0,
    nameDiverged:
      blobName !== columnName ? { column: columnName, blob: blobName } : null,
    nameMissing: columnName === null && blobName === null,
    imageWasArray: Array.isArray(schema?.image),
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

/** Which columns a plan fills, for the per-row progress line. */
function summarize(columns: Partial<Columns>): string {
  return (Object.keys(columns) as Array<keyof Columns>)
    .map((k) => {
      const value = columns[k] ?? "";
      const shown = value.length > 40 ? `${value.slice(0, 39)}…` : value;
      return `${k}=${JSON.stringify(shown)}`;
    })
    .join(" ");
}

async function main() {
  const limit = parseLimit();
  const dryRun = process.argv.includes("--dry-run");
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("recipes")
    .select("id, name, image, description, notes, cooking_notes, metadata")
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
    `${rows.length} recipes total; ${pending.length} with fields to promote; processing ${target}${dryRun ? " (dry run)" : ""}.`,
  );

  let written = 0;
  for (let i = 0; i < target; i++) {
    const { row, planned } = pending[i];
    console.log(`[${i + 1}/${target}] ${label(row)} → ${summarize(planned.columns)}`);
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

  // Reported over every row, not just the processed ones: a name disagreement
  // never makes a row "pending", so only a full scan surfaces it.
  const missing = plans.filter((p) => p.planned.nameMissing);
  if (missing.length > 0) {
    console.log(
      `\n${missing.length} recipe(s) with no name in the column OR the blob — 0027's NOT NULL will reject these:`,
    );
    for (const { row } of missing) console.log(`  ${row.id}`);
    console.log("Give each one a name before applying 0027.");
  }

  const diverged = plans.filter((p) => p.planned.nameDiverged);
  if (diverged.length > 0) {
    console.log(
      `\n${diverged.length} recipe(s) whose name column disagrees with the blob the app has been reading:`,
    );
    for (const { row, planned } of diverged) {
      const { column, blob } = planned.nameDiverged!;
      console.log(
        `  ${row.id} — column ${JSON.stringify(column)}, blob ${JSON.stringify(blob)}`,
      );
    }
    console.log(
      "The column is what every reader switches to. Nothing is written here: check each one and fix it in the editor if the column is the wrong half.",
    );
  }

  const arrays = plans.filter((p) => p.planned.imageWasArray);
  if (arrays.length > 0) {
    console.log(
      `\n${arrays.length} recipe(s) whose blob image was an array — the first entry was taken:`,
    );
    for (const { row } of arrays) console.log(`  ${label(row)}`);
  }

  console.log(
    `\nBackfill pass complete: ${written} row(s) written${dryRun ? " (dry run — nothing written)" : ""}.`,
  );
}

void main();
