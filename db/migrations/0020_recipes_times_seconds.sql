-- 0020_recipes_times_seconds
--
-- Re-base the three 0019 time columns from minutes to SECONDS. Applied via the
-- Supabase MCP `apply_migration` tool (checked-in record only; see 0002).
--
-- Why: minutes were chosen in 0019 because that is the granularity the app
-- displays, but the column is the storage layer, not the display layer, and
-- rounding on the way IN is the one lossy step that cannot be undone later.
-- `parseDurationToSeconds` — which already existed and is what every scraper's
-- ISO 8601 duration passes through — reads seconds natively, so storing
-- seconds means the column can hold any duration the schema can express and
-- the ISO → column direction needs no converter of its own. 0019's
-- isoToMinutes, and with it the sub-half-minute-rounds-to-NULL rule it needed,
-- are deleted rather than adapted.
--
-- A straight ×60. Exact for every value except the two rows whose schema
-- carries a seconds component ("PT30S" and "PT4H5M30S"), which 0019's backfill
-- had already rounded to the minute; re-running the now-seconds backfill
-- afterwards re-derives those two from the blob and corrects them, and no-ops
-- every other row because ×60 already produced the value it would compute.
-- That is also why this is a ×60 rather than a re-derive-from-blob: a recipe
-- saved since 0019 has had its blob time keys stripped, so the blob is no
-- longer a complete source and only the column knows that recipe's times.
--
-- The editor stays in HH:MM, so it cannot express a seconds component; a
-- stored 4h5m30s seeds the field as "4:06" and is rewritten to 4h6m if that
-- recipe is ever edited. Accepted — see formatTimeInput in src/lib/format.ts.
-- Nothing else changes: the columns keep their type, nullability and meaning,
-- and NULL still means "no time recorded".

update public.recipes
set prep_time  = prep_time  * 60,
    cook_time  = cook_time  * 60,
    total_time = total_time * 60
where prep_time is not null
   or cook_time is not null
   or total_time is not null;

comment on column public.recipes.prep_time is
  'Prep time in whole seconds; NULL means no time recorded. Source of truth — metadata.schema.prepTime is a dead pre-0019 artifact.';

comment on column public.recipes.cook_time is
  'Cook time in whole seconds; NULL means no time recorded. Source of truth — metadata.schema.cookTime is a dead pre-0019 artifact.';

comment on column public.recipes.total_time is
  'Total time in whole seconds; NULL means no time recorded. Not derived from prep + cook — a recipe can have resting time that belongs to neither. Source of truth — metadata.schema.totalTime is a dead pre-0019 artifact.';
