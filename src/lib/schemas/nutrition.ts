import { z } from "zod";

// Per-100g nutrition, the "core label set" subset of a USDA FoodData Central
// food (decided against real FDC payloads, 2026-07). This schema is THE
// declaration of which nutrients the catalog knows: the `IngredientNutrition`
// type is inferred from it, the ordered runtime list (@/lib/nutritionFields)
// is checked against it, and the MCP JSON schema and tool prose enumerate
// that list. Adding a nutrient is one edit here, plus a label in
// nutritionColumns.ts that won't compile until you add it.
//
// The keys are the stable JSONB wire format for the ingredients.nutrition
// column — the USDA nutrient id each maps to lives in src/lib/usda.ts. All
// fields are optional: USDA coverage varies per food, and manual entries may
// fill in only what's known.
//
// Its own module, importing nothing but zod, so the type can be re-exported
// from @/types/ingredient without dragging the ingredient CRUD validators
// along with it.
export const nutritionSchema = z
  .object({
    calories_kcal: z.number().nonnegative(),
    protein_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
    saturated_fat_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fiber_g: z.number().nonnegative(),
    sugars_g: z.number().nonnegative(),
    sodium_mg: z.number().nonnegative(),
    cholesterol_mg: z.number().nonnegative(),
    calcium_mg: z.number().nonnegative(),
    iron_mg: z.number().nonnegative(),
    potassium_mg: z.number().nonnegative(),
  })
  .partial();

export type IngredientNutrition = z.infer<typeof nutritionSchema>;
