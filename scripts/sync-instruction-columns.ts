// One-shot sync of `recipes.instructions` to the blob's `recipeInstructions`.
//
//   yarn sync:instruction-columns              # every drifted recipe
//   yarn sync:instruction-columns --limit=10   # cap a pass (smoke-testing)
//   yarn sync:instruction-columns --id=<uuid>  # one recipe only
//   yarn sync:instruction-columns --dry-run    # report only, write nothing
//
// `recipes.instructions` holds RecipeInstructionGroup[] (db/migrations/0021)
// and is the recipe's instructions from this build on; `metadata.schema.
// recipeInstructions` is a dead key. A build that predates this one writes the
// blob and never reads the column, so while one is deployed the blob is what to
// translate from, and this script is the LAST reader of the dead key — run it
// right before deploying. Per recipe: `fromSchemaOrgInstructions` over the blob
// (the same translator create_recipe and the re-scrape webhook run), skip when
// the result already equals the column, else write the column. Nothing else is
// touched — `content` and `embedding` derive from the same step text.
//
// Equality is isDeepStrictEqual, not a JSON.stringify compare: jsonb stores an
// object's keys shortest-first then bytewise, so a step written as
// { text, name, seconds } reads back as { name, text, seconds }, and a string
// compare would rewrite every recipe on every run.
//
// Deterministic and idempotent: no matcher, no model; a second run does nothing.

import { isDeepStrictEqual } from "node:util";
import { fromSchemaOrgInstructions } from "@/lib/format";
import { flattenSteps, stepTimers } from "@/lib/recipeInstructions";
import { getSupabaseAdminClient } from "@/lib/supabase";
import type { SchemaOrgInstructions } from "@/types/recipe";

interface SyncRow {
  id: string;
  name: string;
  metadata: { schema?: { recipeInstructions?: SchemaOrgInstructions | null } } | null;
  // Whatever the column holds today; compared, never read as a shape.
  instructions: unknown[];
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

function parseId(): string | null {
  const arg = process.argv.find((a) => a.startsWith("--id="));
  if (!arg) return null;
  const value = arg.slice("--id=".length).trim();
  if (!value) {
    console.error(`Invalid --id value: ${arg}`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const limit = parseLimit();
  const onlyId = parseId();
  const dryRun = process.argv.includes("--dry-run");
  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from("recipes")
    .select("id, name, metadata, instructions")
    .order("created_at", { ascending: true });
  if (onlyId) query = query.eq("id", onlyId);
  const { data, error } = await query;

  if (error) {
    console.error(`Failed to list recipes: ${error.message}`);
    process.exit(1);
  }

  const recipes = (data ?? []) as unknown as SyncRow[];
  if (onlyId && recipes.length === 0) {
    console.error(`No recipe with id ${onlyId}`);
    process.exit(1);
  }
  console.log(`${recipes.length} recipes; scanning for drift${dryRun ? " (dry run)" : ""}`);

  let scanned = 0;
  let synced = 0;

  for (const recipe of recipes) {
    if (synced >= limit) break;
    scanned += 1;

    const groups = fromSchemaOrgInstructions(recipe.metadata?.schema?.recipeInstructions);
    if (isDeepStrictEqual(groups, recipe.instructions)) continue;

    const summary =
      `${recipe.name} (${recipe.id}): ${flattenSteps(groups).length} step(s) in ` +
      `${groups.length} group(s), ${stepTimers(groups).length} timer(s) — ` +
      `column had ${recipe.instructions.length} item(s)`;

    if (dryRun) {
      console.log(`[dry] ${summary}`);
      synced += 1;
      continue;
    }

    const { error: writeError } = await supabase
      .from("recipes")
      .update({ instructions: groups })
      .eq("id", recipe.id);
    if (writeError) {
      console.error(`  ${recipe.id}: failed to write column — ${writeError.message}`);
      continue;
    }

    synced += 1;
    console.log(`✓ ${summary}`);
  }

  console.log(`Done: ${synced} recipe(s) synced of ${scanned} scanned.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
