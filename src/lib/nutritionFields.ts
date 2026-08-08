import { exhaustiveKeys } from "@/lib/exhaustive";
import type { IngredientNutrition } from "@/types/ingredient";

/**
 * The catalog's per-100g nutrient fields, in USDA label order. THE single
 * source: the zod validator, the MCP JSON schema, the MCP tool descriptions,
 * the nutrition math and the manager's column list all derive from this, so
 * adding a nutrient is one edit here plus one label in nutritionColumns.ts.
 *
 * Order is read by humans — it drives the field list in the search_ingredients
 * tool description and the manager's column order — so keep it USDA-label
 * order rather than sorting it.
 *
 * Built with `exhaustiveKeys` rather than `satisfies readonly (keyof T)[]`:
 * satisfies only rejects unknown keys, so it would silently accept a field
 * added to IngredientNutrition and forgotten here.
 */
export const NUTRITION_FIELDS = exhaustiveKeys<IngredientNutrition>()([
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
]);

export type NutritionField = (typeof NUTRITION_FIELDS)[number];
