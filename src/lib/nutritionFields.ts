import { exhaustiveKeys } from "@/lib/exhaustive";
import type { IngredientNutrition } from "@/lib/schemas/nutrition";

/**
 * The catalog's per-100g nutrient fields as an ORDERED RUNTIME LIST — what the
 * MCP tool prose, the MCP JSON schema, the nutrition math and the manager's
 * columns all iterate.
 *
 * The nutrients themselves are declared by the zod schema
 * (@/lib/schemas/nutrition); this is that set in a form the client can iterate.
 * It exists separately, and stays dependency-free, because those consumers ship
 * to the browser and zod is otherwise server-only here — reading
 * `Object.keys(nutritionSchema.shape)` instead would pull zod into the recipe
 * page's bundle to learn twelve strings.
 *
 * `exhaustiveKeys` is what keeps the two honest: a nutrient added to the schema
 * and missing here fails the build, naming it. Order isn't type-visible, so a
 * reordering is pinned by a test instead.
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
