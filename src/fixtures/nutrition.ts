import { schemaNutritionToValues } from "@/lib/nutritionMath";
import type { SchemaRecipe } from "@/types/recipe";

type SchemaNutrition = NonNullable<SchemaRecipe["nutrition"]>;

/**
 * Every Schema.org nutrient the app models, at one serving of a 4-serving
 * recipe. The summary grid reads only six of them, so sugars, saturated and
 * unsaturated fat, and cholesterol are invisible until the full label — which
 * is the reason that view exists, and the reason this fixture carries all ten.
 *
 * The numbers are load-bearing in tests: 520 kcal × 4 servings split into 8
 * portions is the 260 kcal the panel asserts, and Calories drops its unit on
 * the label so it reads as "520", not "520 kcal".
 */
export const fullSchemaNutrition: SchemaNutrition = {
  calories: "520 kcal",
  proteinContent: "32 g",
  carbohydrateContent: "48 g",
  fatContent: "18 g",
  fiberContent: "6 g",
  sodiumContent: "820 mg",
  sugarContent: "10 g",
  saturatedFatContent: "5 g",
  unsaturatedFatContent: "8 g",
  cholesterolContent: "50 mg",
};

/**
 * A recipe that tracks almost nothing. The counterpart to
 * `fullSchemaNutrition`: on the label the untracked nutrients are omitted
 * outright rather than dashed, so this is what proves a sparse source
 * collapses to a short label instead of a skeleton of empty rows.
 */
export const sparseSchemaNutrition: SchemaNutrition = {
  calories: "350 kcal",
  proteinContent: "22 g",
};

/** `fullSchemaNutrition` in the parsed form the label adapters consume. */
export const fullNutrientValues = schemaNutritionToValues(fullSchemaNutrition);

/** `sparseSchemaNutrition` in the parsed form the label adapters consume. */
export const sparseNutrientValues =
  schemaNutritionToValues(sparseSchemaNutrition);
