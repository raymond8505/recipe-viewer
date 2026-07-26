// Line-contribution nutrition math for the NutritionDetail screen: convert a
// parsed recipe line (quantity + unit) to grams, scale the matched catalog
// ingredient's per-100g nutrition to that mass, and aggregate.
//
// Client-safe and pure — no supabase, no env.

import { convert, isVolumeUnit, roundDecimal, unitKeyForAlias } from "./units";
import { getIngredientText } from "./format";
import type {
  IngredientNutrition,
  IngredientRow,
  RecipeIngredientRow,
} from "@/types/ingredient";
import type { RecipeIngredient, SchemaRecipe } from "@/types/recipe";

/** The Schema.org NutritionInformation shape carried on SchemaRecipe. */
export type SchemaNutrition = NonNullable<SchemaRecipe["nutrition"]>;

/** A catalog row reduced to what the line math needs. */
export type CatalogNutritionSource = Pick<
  IngredientRow,
  "nutrition" | "density_g_per_ml"
>;

// Why a line is excluded from nutrition totals. "stale" is assigned by the
// caller (schema text no longer matches the normalized row) — the math here
// can only detect the other reasons.
export type ExclusionReason =
  | "unmatched"
  | "no_quantity"
  | "no_unit"
  | "no_density"
  | "no_nutrition"
  | "stale";

// Where a line's grams came from. "estimated" = a stored per-line estimate
// (LLM or user-typed), "measured" = parsed quantity+unit conversion (weight
// direct, or volume × density), "annotation" = an explicit "(45g)"-style weight
// in the raw text.
export type GramsProvenance = "estimated" | "measured" | "annotation";

export type LineComputation =
  | {
      kind: "ok";
      grams: number;
      gramsSource: GramsProvenance;
      nutrition: IngredientNutrition;
    }
  | { kind: "excluded"; reason: ExclusionReason };

const NUTRITION_KEYS = [
  "calories_kcal",
  "protein_g",
  "fat_g",
  "saturated_fat_g",
  "carbs_g",
  "fiber_g",
  "sugars_g",
  "sodium_mg",
  "cholesterol_mg",
  "calcium_mg",
  "iron_mg",
  "potassium_mg",
] as const satisfies readonly (keyof IngredientNutrition)[];

/**
 * Convert a parsed quantity + unit to grams. Weight units convert directly;
 * volume units convert to ml then multiply by the ingredient's density.
 * Returns null when the line can't be converted: no quantity, no unit
 * (count lines like "2 eggs"), or a volume unit without a density.
 *
 * `quantity` for parsed ranges is the midpoint (normalization stores
 * (min+max)/2), so totals inherit that approximation.
 */
export function gramsForLine(
  quantity: number | null,
  unit: string | null,
  densityGPerMl: number | null,
): number | null {
  if (quantity == null || unit == null) return null;
  if (isVolumeUnit(unit)) {
    if (densityGPerMl == null) return null;
    return convert(quantity, unit, "ml") * densityGPerMl;
  }
  return convert(quantity, unit, "g");
}

const PAREN_RE = /\(([^)]*)\)/g;
const AMOUNT_UNIT_RE = /^\s*(\d+(?:\.\d+)?)\s*([a-z]+(?:\s[a-z]+)?)\s*$/i;

/**
 * Extract an explicit weight annotation from a recipe line's text — the
 * "(45g)" in "3 tablespoons gochujang paste (45g)" or the "15g" in
 * "3 garlic cloves (minced, 15g)". Parentheticals are split on commas and
 * semicolons so the weight is found among prep notes. Only weight-unit
 * amounts count: volume parentheticals still need a density, and bare
 * amounts outside parentheses are the parser's job. Returns grams, or null
 * when no parenthetical converts.
 */
export function explicitWeightGrams(text: string): number | null {
  for (const [, inner] of text.matchAll(PAREN_RE)) {
    for (const segment of inner.split(/[,;]/)) {
      const match = segment.match(AMOUNT_UNIT_RE);
      if (!match) continue;
      const unitKey = unitKeyForAlias(match[2]);
      if (!unitKey || isVolumeUnit(unitKey)) continue;
      const grams = convert(parseFloat(match[1]), unitKey, "g");
      if (grams > 0) return grams;
    }
  }
  return null;
}

/**
 * Scale per-100g nutrition to a gram amount. Only keys present on the input
 * appear on the output — key sparsity is meaningful (absent ≠ zero).
 */
export function scaleNutritionToGrams(
  per100g: IngredientNutrition,
  grams: number,
): IngredientNutrition {
  const scaled: IngredientNutrition = {};
  for (const key of NUTRITION_KEYS) {
    const value = per100g[key];
    if (value != null) scaled[key] = (value * grams) / 100;
  }
  return scaled;
}

/**
 * Inverse of scaleNutritionToGrams: take nutrition entered against a portion of
 * `portionGrams` and scale it up to the per-100g basis the catalog stores. The
 * create form lets a user type values for, say, a 30 g serving; this converts
 * them to per-100g before persisting so matching and the rest of nutritionMath
 * keep their single per-100g contract. Entering against a 100 g portion is an
 * identity transform (values already at ≤2 dp stay untouched). Results are
 * rounded to 2 dp — hand-entered nutrition carries no meaningful precision
 * beyond that, and it keeps the stored catalog value free of float noise
 * (e.g. 7 g protein in a 32 g serving → 21.88, not 21.875). Key sparsity is
 * preserved (absent ≠ zero); a non-positive `portionGrams` yields an empty
 * object rather than dividing by zero.
 */
export function scalePortionNutritionToPer100g(
  entered: IngredientNutrition,
  portionGrams: number,
): IngredientNutrition {
  const per100g: IngredientNutrition = {};
  if (portionGrams <= 0) return per100g;
  for (const key of NUTRITION_KEYS) {
    const value = entered[key];
    if (value != null) per100g[key] = roundDecimal((value * 100) / portionGrams, 2);
  }
  return per100g;
}

/**
 * Full line computation: grams conversion + nutrition scaling, or the
 * exclusion reason. Exclusion checks are ordered most-fundamental-first so
 * the flag names the primary blocker (an unmatched line is "unmatched" even
 * if it also lacks a unit).
 *
 * Grams precedence:
 *   1. a stored per-line `estimated_grams` (LLM or user-typed) — an explicit
 *      decision, so it beats the derived value (a manual override/re-estimate
 *      wins);
 *   2. the parsed quantity+unit conversion (weight direct, volume × density);
 *   3. an explicit "(45g)"-style weight annotation in the raw text — the
 *      fallback that rescues volume lines matched to density-less ingredients
 *      (e.g. Branded USDA imports carry no portions).
 * A grams-less line falls to the ordered exclusion reasons.
 */
export function computeLineNutrition(
  row: Pick<
    RecipeIngredientRow,
    "quantity" | "unit" | "ingredient_id" | "raw_text" | "estimated_grams"
  >,
  ingredient: Pick<IngredientRow, "nutrition" | "density_g_per_ml"> | null,
): LineComputation {
  if (row.ingredient_id == null || ingredient == null) {
    return { kind: "excluded", reason: "unmatched" };
  }
  if (ingredient.nutrition == null) {
    return { kind: "excluded", reason: "no_nutrition" };
  }

  const parsedGrams =
    row.quantity != null && row.unit != null
      ? gramsForLine(row.quantity, row.unit, ingredient.density_g_per_ml)
      : null;

  let grams: number | null;
  let gramsSource: GramsProvenance;
  if (row.estimated_grams != null) {
    grams = row.estimated_grams;
    gramsSource = "estimated";
  } else if (parsedGrams != null) {
    grams = parsedGrams;
    gramsSource = "measured";
  } else {
    grams = explicitWeightGrams(row.raw_text);
    gramsSource = "annotation";
  }

  if (grams == null) {
    if (row.quantity == null) return { kind: "excluded", reason: "no_quantity" };
    if (row.unit == null) return { kind: "excluded", reason: "no_unit" };
    return { kind: "excluded", reason: "no_density" };
  }

  return {
    kind: "ok",
    grams,
    gramsSource,
    nutrition: scaleNutritionToGrams(ingredient.nutrition, grams),
  };
}

/**
 * Key-wise sum. A key appears on the result iff it's present on at least one
 * line — so a recipe where no ingredient reports cholesterol shows no
 * cholesterol total rather than a misleading 0.
 */
export function sumNutrition(lines: IngredientNutrition[]): IngredientNutrition {
  const total: IngredientNutrition = {};
  for (const line of lines) {
    for (const key of NUTRITION_KEYS) {
      const value = line[key];
      if (value != null) total[key] = (total[key] ?? 0) + value;
    }
  }
  return total;
}

/** Divide a total by servings, keeping key sparsity. */
export function perPortionNutrition(
  total: IngredientNutrition,
  servings: number,
): IngredientNutrition {
  const perPortion: IngredientNutrition = {};
  for (const key of NUTRITION_KEYS) {
    const value = total[key];
    if (value != null) perPortion[key] = value / servings;
  }
  return perPortion;
}

// ─── Recipe-wide aggregation + recipe-nutrition source resolution ──────────

/**
 * The line computation for a schema line joined to its normalized row. A line
 * is "stale" when there is no row for its position, or the stored `raw_text` no
 * longer equals the recipe's display text (the recipe was edited after the last
 * normalization run) — such a line can't be trusted and is excluded. Otherwise
 * defers to `computeLineNutrition`. Shared by the NutritionDetail hook and the
 * recipe-wide total so the two paths can never disagree.
 */
export function lineComputationForSchema(
  schemaText: string,
  row: RecipeIngredientRow | null,
  ingredient: CatalogNutritionSource | null,
): LineComputation {
  if (!row || row.raw_text !== schemaText) {
    return { kind: "excluded", reason: "stale" };
  }
  return computeLineNutrition(row, ingredient);
}

export interface RecipeNutritionResult {
  /** Whole-recipe total (sum of every `ok` line), snake_case per-nutrient. */
  total: IngredientNutrition;
  lineCount: number;
  excludedCount: number;
  hasStaleLines: boolean;
  /**
   * True only when there is at least one line and every line contributed
   * (no exclusions). The nutrition panel prefers the normalized total only in
   * this case — a partial total would silently undercount.
   */
  fullyCovered: boolean;
}

/**
 * Aggregate a recipe's normalized ingredient nutrition. Schema lines join to
 * `recipe_ingredients` rows by position (the array index — see
 * `groupIngredientsWithIndex`), each line is computed via
 * `lineComputationForSchema`, and the `ok` lines are summed into a whole-recipe
 * total. `ingredientsById` maps `ingredient_id` → catalog nutrition/density.
 */
export function computeRecipeNutrition(
  schemaIngredients: Array<string | RecipeIngredient>,
  rows: RecipeIngredientRow[],
  ingredientsById: Map<string, CatalogNutritionSource>,
): RecipeNutritionResult {
  const rowsByPosition = new Map(rows.map((row) => [row.position, row]));
  const computations = schemaIngredients.map((ingredient, index) => {
    const text = getIngredientText(ingredient);
    const row = rowsByPosition.get(index) ?? null;
    const catalog =
      row?.ingredient_id != null
        ? (ingredientsById.get(row.ingredient_id) ?? null)
        : null;
    return lineComputationForSchema(text, row, catalog);
  });

  const total = sumNutrition(
    computations
      .filter((c): c is Extract<LineComputation, { kind: "ok" }> => c.kind === "ok")
      .map((c) => c.nutrition),
  );
  const excludedCount = computations.filter((c) => c.kind === "excluded").length;
  const hasStaleLines = computations.some(
    (c) => c.kind === "excluded" && c.reason === "stale",
  );

  return {
    total,
    lineCount: computations.length,
    excludedCount,
    hasStaleLines,
    fullyCovered: computations.length > 0 && excludedCount === 0,
  };
}

// snake_case IngredientNutrition key → Schema.org NutritionInformation field +
// unit. calcium/iron/potassium have no Schema.org slot, so they're omitted.
const SCHEMA_NUTRITION_MAP: ReadonlyArray<{
  key: keyof IngredientNutrition;
  field: Exclude<keyof SchemaNutrition, "@type">;
  unit: string;
}> = [
  { key: "calories_kcal", field: "calories", unit: "kcal" },
  { key: "protein_g", field: "proteinContent", unit: "g" },
  { key: "fat_g", field: "fatContent", unit: "g" },
  { key: "saturated_fat_g", field: "saturatedFatContent", unit: "g" },
  { key: "carbs_g", field: "carbohydrateContent", unit: "g" },
  { key: "fiber_g", field: "fiberContent", unit: "g" },
  { key: "sugars_g", field: "sugarContent", unit: "g" },
  { key: "sodium_mg", field: "sodiumContent", unit: "mg" },
  { key: "cholesterol_mg", field: "cholesterolContent", unit: "mg" },
];

// Match scaleNutrientValue's formatting: one decimal place when fractional,
// integer otherwise (e.g. "480 kcal", "12.5 g").
function formatNutrientValue(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  const formatted = rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
  return `${formatted} ${unit}`;
}

/**
 * Convert a whole-recipe normalized total to a Schema.org per-serving nutrition
 * object (camelCase string values with units). Key sparsity is preserved — a
 * nutrient no ingredient reports simply doesn't appear. A non-positive
 * `servings` yields an empty object rather than dividing by zero.
 */
export function normalizedTotalToPerServingSchema(
  total: IngredientNutrition,
  servings: number,
): SchemaNutrition {
  const result: SchemaNutrition = {};
  if (servings <= 0) return result;
  for (const { key, field, unit } of SCHEMA_NUTRITION_MAP) {
    const value = total[key];
    if (value != null) result[field] = formatNutrientValue(value / servings, unit);
  }
  return result;
}

