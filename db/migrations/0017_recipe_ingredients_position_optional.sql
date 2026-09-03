-- 0017_recipe_ingredients_position_optional
--
-- Take `recipe_ingredients.position` out of the write path without deleting it
-- yet. Applied via the Supabase MCP `apply_migration` tool (checked-in record
-- only; see 0002).
--
-- 0016 made `recipes.ingredients` the ordering: a line's position is its index
-- in that array. `position` is therefore already dead, but it cannot be dropped
-- in the same breath — the currently-deployed build still writes it on every
-- normalization run, and it is NOT NULL with no default. This migration is the
-- bridge that lets both builds run at once: 0018 does the actual drop, once the
-- new build is out.
--
-- Two changes, both needed by the new reconcile write path:
--
-- 1. DEFAULT 0. Lets the new code insert rows without supplying a position at
--    all. The value is meaningless from here on — nothing reads it.
--
-- 2. DROP the unique (recipe_id, position) constraint. The new write path
--    inserts new rows and updates reworded ones in SEPARATE statements (one
--    PostgREST request each), so a freshly inserted row would collide with an
--    existing row whose position is about to move. 0014 made the constraint
--    DEFERRABLE to survive a reorder inside one statement; that is not enough
--    across two, and the constraint is protecting an invariant that no longer
--    exists.
--
-- The old build is unaffected: it writes positions explicitly and never relied
-- on the constraint for correctness — 0014's comment records that the
-- constraint was an obstacle to reordering rather than a guarantee anything
-- wanted.

alter table public.recipe_ingredients
  drop constraint if exists recipe_ingredients_recipe_id_position_key;

alter table public.recipe_ingredients
  alter column position set default 0;

comment on column public.recipe_ingredients.position is
  'DEAD as of db/migrations/0016 — a line''s position is its index in recipes.ingredients. Retained only so the pre-0016 build keeps working during rollout; dropped in 0018.';
