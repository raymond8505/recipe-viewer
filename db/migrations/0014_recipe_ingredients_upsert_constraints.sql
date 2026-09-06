-- 0014_recipe_ingredients_upsert_constraints
--
-- Ingredient manager — make the 0013 line_id key actually usable as an
-- ON CONFLICT target, and let a reorder land. Applied via the Supabase MCP
-- `apply_migration` tool (checked-in record only; see 0002).
--
-- Two defects in 0013, both found by running it:
--
-- 1. `recipe_ingredients_recipe_line_key` was created PARTIAL
--    (where line_id is not null). Postgres will only infer a partial index as
--    an ON CONFLICT arbiter if the statement repeats the index predicate
--    (`on conflict (recipe_id, line_id) where line_id is not null`), and
--    PostgREST's `on_conflict` parameter takes column names only — it cannot
--    express a predicate. So replaceRecipeIngredients' upsert failed with
--    "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification" the first time a recipe normalized.
--
--    The predicate bought nothing anyway: unique indexes treat NULLs as
--    distinct by default (NULLS DISTINCT), so a plain index already permits
--    the many rows that legitimately have no line_id yet. Verified against
--    this database, which had 27 such rows across recipes including 2 with
--    several apiece — the index below would have failed to build otherwise.
--
-- 2. `unique (recipe_id, position)` (from 0003) is NOT DEFERRABLE. Position
--    was the identity back then, so nothing ever moved. Now that line_id is
--    the identity, position is display ordering and reordering two lines
--    swaps their values — which trips the constraint mid-statement even
--    though the end state is perfectly valid. Deferring the check to commit
--    lets a swap through while keeping the invariant it was protecting.
--
--    (This is why the writers batch position changes into ONE statement:
--    initially-deferred only helps within a transaction, and PostgREST gives
--    each request exactly one.)
--
-- Postscript (2026-09, after 0016/0017): both halves are moot. 0016 made a
-- line's identity the row's own primary key and its order the index in
-- recipes.ingredients, so `line_id` is no longer anything's ON CONFLICT
-- target, and 0017 dropped the deferred (recipe_id, position) constraint
-- outright — the reorder problem it deferred can't arise when nothing writes
-- position. The line_id index remains as an inert artifact.

drop index if exists public.recipe_ingredients_recipe_line_key;

create unique index recipe_ingredients_recipe_line_key
  on public.recipe_ingredients (recipe_id, line_id);

alter table public.recipe_ingredients
  drop constraint if exists recipe_ingredients_recipe_id_position_key;

alter table public.recipe_ingredients
  add constraint recipe_ingredients_recipe_id_position_key
  unique (recipe_id, position) deferrable initially deferred;
