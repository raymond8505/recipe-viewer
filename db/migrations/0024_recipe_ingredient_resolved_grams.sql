-- 0024_recipe_ingredient_resolved_grams
--
-- What each ingredient line weighs, so recipe search can rank a match by the
-- share of the recipe it accounts for. Applied via the Supabase MCP
-- `apply_migration` tool (checked-in record only; see 0002).
--
-- DERIVED, NOT ENTERED. The value is `resolveLineGrams` (src/lib/nutritionMath.ts)
-- — the same resolver the nutrition math runs — stamped at the two row-write
-- chokepoints, `insertRecipeIngredientRows` and `updateRecipeIngredientRows`
-- (src/lib/ingredients.ts). Every writer already funnels through those two, so
-- the column cannot drift from the lines it describes: the reconcile's inserts
-- and rewords, normalization's persist, and the grams PATCH all restamp it.
-- This mirrors how `recipes.content` / `recipes.embedding` are derived at that
-- table's two write helpers.
--
-- WHY A COLUMN AND NOT SQL. Resolving a line's weight means
-- `estimated_grams`, else quantity x unit (x density for a volume), else a
-- parenthetical "(14 oz)" in the text — which needs the unit table in
-- src/lib/units.ts and a regex. Re-deriving those in SQL would put a second
-- copy of the conversions in the database, which the repo's data-layer doc
-- forbids by name. Persisting the answer keeps SQL to sum() and a division.
--
-- WRITE-ONLY, like ingredients.embedding: deliberately absent from
-- `RecipeIngredientRow`, so `selectColumns` exhaustiveness keeps it off every
-- read. Nothing above the repo layer reads a stored weight; the nutrition math
-- resolves its own from the hydrated line, which is what keeps a drafted line
-- (a re-scrape under review, no row yet) computing the same as a saved one.
--
-- NULL means "this line's weight is unknown", not zero — a count line with no
-- density, say. Search treats it as contributing nothing to a share rather
-- than as a 0 g line, and 0 keeps its existing meaning: a curator's "don't
-- count this line" (see nutrition.md).

alter table public.recipe_ingredients
  add column if not exists resolved_grams numeric;

comment on column public.recipe_ingredients.resolved_grams is
  'Derived line weight in grams (resolveLineGrams, src/lib/nutritionMath.ts), stamped by insertRecipeIngredientRows/updateRecipeIngredientRows. Write-only: absent from RecipeIngredientRow so selectColumns keeps it off reads. NULL = weight unknown; 0 = deliberately not counted. Ranks ingredient matches in recipe search.';
