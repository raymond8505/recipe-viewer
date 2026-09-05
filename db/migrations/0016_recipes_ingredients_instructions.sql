-- 0016_recipes_ingredients_instructions
--
-- Promote a recipe's ingredient list and instruction steps out of the
-- `metadata` JSONB blob into top-level columns. Applied via the Supabase MCP
-- `apply_migration` tool (checked-in record only; see 0002).
--
-- Why: these are the two largest and most-mutated parts of a recipe, and
-- burying them in `metadata.schema` cost us on every axis. They can't be
-- queried or indexed in SQL; every partial write has to read-merge-write the
-- whole blob; and RecipeRow's type said nothing about the fields the app
-- touches most. `status` was promoted out of the same blob for the same
-- reasons (see the 'promote status from metadata JSONB' commit) — this is that
-- move, finished.
--
-- The two columns are NOT symmetrical, deliberately:
--
-- `instructions` is a straight mirror of metadata.schema.recipeInstructions —
-- an array of HowToStep / HowToSection. Nothing else references it, so there
-- is nothing to normalize it against.
--
-- `ingredients` is NOT a mirror. It is an ordered array of GROUP objects whose
-- `ingredients` arrays hold bare recipe_ingredients.id values:
--
--   [ { "name": "Meatballs",   "ingredients": ["<uuid>", "<uuid>"] },
--     { "name": "Curry sauce", "ingredients": ["<uuid>"] } ]
--
-- An ungrouped recipe is a single group object with the `name` key ABSENT:
--
--   [ { "ingredients": ["<uuid>", "<uuid>"] } ]
--
-- Why IDs rather than text: a line's position becomes its index in these
-- arrays, and its identity becomes the recipe_ingredients row's own primary
-- key. That deletes both pieces of bookkeeping that existed only because the
-- real list lived in a blob — `recipe_ingredients.line_id` (0013, a synthetic
-- id mirrored onto each schema line so curated catalog associations survived a
-- reword) and `recipe_ingredients.position` (a denormalized copy of the schema
-- array index, whose uniqueness constraint had to be made DEFERRABLE in 0014
-- purely so a reorder could land). Both are dropped in 0017.
--
-- CONSEQUENCE, accepted: this inverts recipe_ingredients. 0003 said "the
-- recipe's schema stays the display source of truth — these rows never feed
-- back into recipe text." That is no longer true. recipe_ingredients.raw_text
-- IS the recipe's ingredient text from here on, a `recipes` row alone can no
-- longer render an ingredient list, and a bug that loses those rows now loses
-- recipe content rather than just derived nutrition data.
--
-- Only 16 of 576 recipes had any recipe_ingredients rows when this was written
-- (215 rows total), so scripts/backfill-ingredient-columns.ts has to
-- materialize ~6,260 of them. It does that DETERMINISTICALLY —
-- parseLineDeterministic, ingredient_id null, match_status 'unmatched' — and
-- never runs the matcher: normalization is human-in-the-loop, and bulk-guessing
-- 551 recipes' worth of catalog associations is exactly what that rule exists
-- to prevent. Curation happens per recipe, as it already did.
--
-- This migration only ADDS. metadata.schema keeps its copy of both fields, so
-- the currently-deployed build goes on working while the new one is rolled out.
-- 0017 strips those keys, drops line_id/position, and rewrites the four RPCs
-- that hand metadata->'schema' to n8n — run it only once the new build is
-- deployed and verified, because until then the blob is the fallback.
--
-- NOT NULL DEFAULT '[]' on both: an empty list and an absent list are not a
-- distinction anything acts on (every reader already spelled it `?? []`), and
-- the default is what lets this run ahead of the backfill without a null-check
-- appearing in every consumer.
--
-- Postscript (2026-09): the two forward references above did not happen as
-- written. 0017 only gave `position` a default and dropped its unique
-- constraint (the bridge that let both builds write at once); it did NOT drop
-- line_id/position, strip the blob keys, or touch the RPCs. The decision since
-- is that line_id, position and the metadata.schema copies of
-- recipeIngredient/recipeInstructions all STAY, as dead artifacts of the old
-- shape — nothing reads them, and dropping them buys nothing worth a second
-- rollout window. That makes the blob copies frozen at backfill time, which is
-- exactly why every reader must go through composeRecipeSchema
-- (src/lib/recipeSchema.ts) rather than metadata.schema. The RPC rewrite that
-- hands n8n a composed schema is a separate 0018, to land after this build
-- deploys.

alter table public.recipes
  add column if not exists ingredients  jsonb not null default '[]'::jsonb,
  add column if not exists instructions jsonb not null default '[]'::jsonb;

comment on column public.recipes.ingredients is
  'Ordered ingredient groups: [{ name?, ingredients: recipe_ingredients.id[] }]. Position is the array index; the group name is absent when the recipe is ungrouped. Line text lives in recipe_ingredients.raw_text.';

comment on column public.recipes.instructions is
  'Schema.org recipeInstructions: an array of HowToStep and/or HowToSection.';
