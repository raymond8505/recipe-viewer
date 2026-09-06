-- 0019_recipes_times
--
-- Promote a recipe's three time values out of the `metadata` JSONB blob into
-- top-level columns. Applied via the Supabase MCP `apply_migration` tool
-- (checked-in record only; see 0002).
--
-- Why: prepTime/cookTime/totalTime sat in `metadata.schema` as ISO 8601
-- strings, which cost us the same way `status`, `ingredients` and
-- `instructions` did before they were promoted (0016). "Show me everything
-- under 30 minutes" was not expressible in SQL; every write had to
-- read-merge-write the whole blob to touch a five-character value; and
-- RecipeRow's type said nothing about them. They were also the only part of a
-- recipe with NO editing UI at all — a scraped recipe with a wrong prep time
-- could only be fixed through MCP or raw SQL.
--
-- INTEGER MINUTES, not the ISO text. Storing 'PT1H30M' verbatim would have
-- made the backfill a one-line SQL copy, but it buys nothing: ordering and
-- range filters — the entire reason to promote these — still need a parse.
-- Minutes are what the app already reduces every duration to for display
-- (formatDuration discards seconds), and they match the shape the legacy
-- recipes_v2 table chose for the same three fields.
--
-- NULLABLE, no default — deliberately unlike 0016's `not null default '[]'`.
-- There, an empty list and an absent list were not a distinction anything
-- acted on. Here they are: NULL renders no stat at all, while 0 would render
-- "0 min" and assert a zero-minute recipe. isoToMinutes() in src/lib/format.ts
-- therefore maps a sub-30-second duration to NULL rather than rounding it to 0.
--
-- The blob keeps its copy, and it is DEAD from here on — not a fallback, not a
-- second source of truth, just an artifact of the old shape. Unlike 0016 (which
-- kept metadata readable so the deployed build could run through the rollout)
-- there is no follow-up migration to strip these keys. The repo layer
-- overwrites metadata.schema's three time keys from these columns on every read
-- and strips them from everything it writes, so nothing above src/lib/recipes.ts
-- can observe the stale value. That seam is the thing to preserve: a reader that
-- goes to the blob directly gets a pre-0019 answer with no error to warn it.
--
-- scripts/backfill-recipe-times.ts populates the columns. It is a TS script
-- rather than SQL so it reuses parseDurationToSeconds — the backfill and the
-- runtime have to agree on what counts as a parseable duration, and a regex
-- rewritten in PL/pgSQL is exactly where that agreement would drift.

alter table public.recipes
  add column if not exists prep_time  integer,
  add column if not exists cook_time  integer,
  add column if not exists total_time integer;

comment on column public.recipes.prep_time is
  'Prep time in whole minutes; NULL means no time recorded. Source of truth — metadata.schema.prepTime is a dead pre-0019 artifact.';

comment on column public.recipes.cook_time is
  'Cook time in whole minutes; NULL means no time recorded. Source of truth — metadata.schema.cookTime is a dead pre-0019 artifact.';

comment on column public.recipes.total_time is
  'Total time in whole minutes; NULL means no time recorded. Not derived from prep + cook — a recipe can have resting time that belongs to neither. Source of truth — metadata.schema.totalTime is a dead pre-0019 artifact.';
