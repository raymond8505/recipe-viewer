-- 0009_recipe_ingredient_estimated_grams
--
-- Ingredient manager — LLM/manual gram estimates on parsed lines. Applied via
-- the Supabase MCP `apply_migration` tool (checked-in record only; see 0002).
--
-- Some lines can't be converted to grams by the density path: a volume unit
-- matched to a density-less ingredient, or a count/can line like
-- "540 ml canned chickpeas drained" (a can-yield, not a linear density).
-- `estimated_grams` is a per-line resolved weight that rescues those lines for
-- nutrition totals. It is INTERNAL to the NutritionDetail manager — it never
-- feeds back into recipe text or the Schema.org JSON-LD.
--
-- A stored `estimated_grams` is an explicit decision and takes precedence over
-- the density-derived value in src/lib/nutritionMath.ts (so a manual override
-- or re-estimate wins). `grams_source` records provenance for the display
-- marker only — the math keys off `estimated_grams` presence alone:
--   'llm'    — the normalization graph, or the NutritionDetail "Estimate" button
--   'manual' — a user-typed value in the NutritionDetail grams field
-- `grams_source` is null exactly when `estimated_grams` is null.

alter table public.recipe_ingredients
  add column estimated_grams numeric,
  add column grams_source text check (grams_source in ('llm', 'manual'));
