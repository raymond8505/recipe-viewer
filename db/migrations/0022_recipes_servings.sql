-- 0022_recipes_servings
--
-- Promote a recipe's serving count, its serving unit and its whole-recipe raw
-- weight out of the `metadata` JSONB blob into top-level columns. Applied via
-- the Supabase MCP `apply_migration` tool (checked-in record only; see 0002).
--
-- Why: this is the last field in the blob that was PARSED on every read.
-- `metadata.schema.recipeYield` held free text — '4 servings', '6-8 servings',
-- 'Makes 6', '3-4 porciones' — or a Schema.org QuantitativeValue, and the app
-- ran a regex over it every time it needed the number that every scaling and
-- per-serving-nutrition operation divides by. Worse, an EDIT round-tripped
-- through that string: applyServings() wrote a new count back by splicing the
-- digits into the original text, and its inverse had to agree with it token for
-- token. And because a unit only existed on the QuantitativeValue form, every
-- string-form recipe rendered a generic 'Servings' label no matter what it
-- actually made. The parse was overhead we tolerated for speed; the columns
-- retire it.
--
-- ONE PAIR COVERS BOTH FIELDS. `metadata.schema.nutrition.servingSize` ('1
-- serving', '1 wrap', '¼ cup') was a second, redundant spelling of the same
-- fact: a serving is one unit of what the yield counts. It is not stored any
-- more. The two wire boundaries that published it — RecipeDetail's JSON-LD and
-- MCP get_recipe — regenerate it as '1 <singular servings_unit>', which
-- reproduces 180 of the 197 stored strings exactly. Nothing in the UI ever
-- rendered it; the nutrition panel labels itself from the weight columns below.
--
-- NUMERIC, not integer: parseServings({ value: 2.5 }) returns 2.5 today and a
-- test pins it, and fractional yields exist in the wild.
--
-- NULLABLE, no default — the same argument 0019 made for the time columns. 158
-- of 578 rows have no yield at all (key absent, JSON null, or ''), and NULL is
-- a state the app acts on: a null servings_amount disables scaling and reports
-- no nutrition. `not null default 1` would instead assert 'this recipe makes
-- one serving', which makes per-serving nutrition equal whole-recipe nutrition
-- and prints a false number on a card.
--
-- servings_unit has NO DATABASE DEFAULT even though the app's fallback is
-- 'servings'. A column default only fires on INSERT-without-the-column, so
-- every backfilled row and every explicit-null write would bypass it — the app
-- needs the fallback regardless, and two homes for one rule is how they drift.
-- NULL here also carries information the default would destroy: the source
-- named no unit. The single constant is SERVINGS_UNIT_FALLBACK in
-- src/lib/format.ts. The unit is stored PLURAL, as sources write it
-- ('servings', 'kebabs', 'wraps'), matching QuantitativeValue.unitText
-- semantics; singularServingUnit() handles the one site that wants '1 kebab'.
--
-- total_weight_* is the ex-`recipeYield.valueReference`: the raw weight or
-- volume of the WHOLE recipe at its base servings, which is what lets the
-- nutrition panel say 'per 114 g serving'. It is an amount + unit PAIR rather
-- than a single grams column because convert() refuses to cross the
-- weight/volume groups by design — there is no honest ml→g without a density —
-- and because the unit is rendered verbatim. The unit check mirrors the zod
-- `metricQuantitativeValue` enum so the database, the validator and the MCP
-- JSON schema all agree on the same four symbols; one pre-validator row stores
-- 'cups' and is therefore reported, not converted. total_weight_unit is NULL
-- exactly when total_weight_amount is — the app is the only writer and writes
-- both or neither, so that is documented here rather than constrained.
--
-- No index: nothing filters on servings yet. Add one when it does (0019 made
-- the same call for the times).
--
-- The blob keeps both copies, and they are DEAD from here on — not a fallback,
-- not a second source of truth. As in 0019 there is no follow-up migration to
-- strip them. Unlike the times, there is also NO hydrate-back: nothing above
-- src/lib/recipes.ts reads `schema.recipeYield` or `schema.nutrition.servingSize`
-- any more, and writing the keys back onto the blob at the read exit would
-- recreate the very string-round-trip this migration deletes. Instead both keys
-- join DEAD_SCHEMA_KEYS — deleted at the read exit, stripped from every write
-- (the zod schema is .passthrough(), so an agent can still send them) — and the
-- outbound Schema.org edges synthesize `recipeYield` as a QuantitativeValue
-- from these columns. A reader that goes to the blob directly gets a pre-0022
-- answer with no error to warn it.
--
-- scripts/backfill-recipe-servings.ts populates the columns. It is a TS script
-- rather than SQL so it reuses parseYield — the backfill and the runtime have to
-- agree on what counts as a parseable yield, and a regex rewritten in PL/pgSQL
-- is exactly where that agreement would drift. It reports three buckets and
-- guesses at none of them: rows it could not parse, rows whose rendered label
-- now differs from the original string (collapsed ranges, dropped
-- parentheticals), and rows whose servingSize said something the pair cannot
-- reconstruct. It does NOT refresh the derived `content` column (0019's didn't
-- either), so a recipe's embedded markdown keeps its old yield line until that
-- recipe is next saved.

alter table public.recipes
  add column if not exists servings_amount     numeric check (servings_amount is null or servings_amount > 0),
  add column if not exists servings_unit       text,
  add column if not exists total_weight_amount numeric check (total_weight_amount is null or total_weight_amount > 0),
  add column if not exists total_weight_unit   text check (total_weight_unit is null or total_weight_unit in ('g','kg','ml','l'));

comment on column public.recipes.servings_amount is
  'How many servings the recipe makes at base scale; NULL means no serving count is known (no scaling, no per-serving nutrition). Numeric because fractional yields exist. Source of truth — metadata.schema.recipeYield is a dead pre-0022 artifact.';

comment on column public.recipes.servings_unit is
  'What servings_amount counts, PLURAL as the source wrote it ("servings", "kebabs", "wraps"); NULL means the source named no unit and the app falls back to SERVINGS_UNIT_FALLBACK ("servings"). No database default on purpose — see the migration comment.';

comment on column public.recipes.total_weight_amount is
  'Raw weight or volume of the WHOLE recipe at base servings — the ex-recipeYield.valueReference. Divided by the displayed portion count to label nutrition "per 114 g serving". NULL when unknown.';

comment on column public.recipes.total_weight_unit is
  'Unit of total_weight_amount, one of g/kg/ml/l — the same enum as the zod metricQuantitativeValue. NULL exactly when total_weight_amount is NULL; the app writes both or neither.';
