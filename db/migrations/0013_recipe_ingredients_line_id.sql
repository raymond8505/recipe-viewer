-- 0013_recipe_ingredients_line_id
--
-- Ingredient manager — give a derived ingredient row a stable handle on the
-- recipe line it came from. Applied via the Supabase MCP `apply_migration`
-- tool (checked-in record only; see 0002).
--
-- Until now a row was tied to its line by `position` (the schema array index)
-- and, across the delete-then-insert of a normalization run, by `raw_text` —
-- the carry-forward maps in normalization/graph.ts used raw_text as a de facto
-- primary key. Both are display data. Fixing a typo, rewording a line or
-- inserting one above it silently re-keyed the row, which threw away the
-- association a user had curated on it and sent the matcher off to guess again.
--
-- `line_id` matches SchemaRecipe.recipeIngredient[].id. It is the identity;
-- text and position are free to move underneath it.
--
-- Nullable, because rows written before this exist and recipes saved before
-- this have no ids on their lines. scripts/backfill-line-ids.ts fills both by
-- position, after which every row has one. The partial unique index enforces
-- one row per line per recipe wherever the value is present, which is also
-- what lets normalization upsert on it.

alter table public.recipe_ingredients
  add column if not exists line_id text;

create unique index if not exists recipe_ingredients_recipe_line_key
  on public.recipe_ingredients (recipe_id, line_id)
  where line_id is not null;

comment on column public.recipe_ingredients.line_id is
  'Stable id of the schema ingredient line (SchemaRecipe.recipeIngredient[].id). The join key — position and raw_text are display data and may change freely.';
