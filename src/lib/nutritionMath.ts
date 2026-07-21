// Line-contribution nutrition math for the NutritionDetail screen: convert a
// parsed recipe line (quantity + unit) to grams, scale the matched catalog
// ingredient's per-100g nutrition to that mass, and aggregate.
//
// Client-safe and pure — no supabase, no env.

import { convert, isVolumeUnit } from "./units";
import type {
  IngredientNutrition,
  IngredientRow,
  RecipeIngredientRow,
} from "@/types/ingredient";

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

export type LineComputation =
  | { kind: "ok"; grams: number; nutrition: IngredientNutrition }
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
 * Full line computation: grams conversion + nutrition scaling, or the
 * exclusion reason. Exclusion checks are ordered most-fundamental-first so
 * the flag names the primary blocker (an unmatched line is "unmatched" even
 * if it also lacks a unit).
 */
export function computeLineNutrition(
  row: Pick<RecipeIngredientRow, "quantity" | "unit" | "ingredient_id">,
  ingredient: Pick<IngredientRow, "nutrition" | "density_g_per_ml"> | null,
): LineComputation {
  if (row.ingredient_id == null || ingredient == null) {
    return { kind: "excluded", reason: "unmatched" };
  }
  if (ingredient.nutrition == null) {
    return { kind: "excluded", reason: "no_nutrition" };
  }
  if (row.quantity == null) return { kind: "excluded", reason: "no_quantity" };
  if (row.unit == null) return { kind: "excluded", reason: "no_unit" };

  const grams = gramsForLine(row.quantity, row.unit, ingredient.density_g_per_ml);
  if (grams == null) return { kind: "excluded", reason: "no_density" };

  return {
    kind: "ok",
    grams,
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
