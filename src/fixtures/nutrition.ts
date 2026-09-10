import { schemaNutritionToValues } from "@/lib/nutritionMath";
import type { IngredientNutrition } from "@/types/ingredient";
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

/**
 * `fullSchemaNutrition`'s numbers as a WHOLE-RECIPE catalog total — the same
 * per-serving figures × 4 servings. Since the catalog became the only source of
 * nutrition, this is the shape a panel story or test needs to render the values
 * the Schema.org fixture above merely describes.
 *
 * One nutrient can't cross over: the catalog has no unsaturated-fat column (see
 * SCHEMA_NUTRITION_MAP), so `unsaturatedFatContent` has no counterpart here and
 * that label row is unreachable by design.
 */
export const fullCatalogTotal: IngredientNutrition = {
  calories_kcal: 2080,
  protein_g: 128,
  carbs_g: 192,
  fat_g: 72,
  fiber_g: 24,
  sodium_mg: 3280,
  sugars_g: 40,
  saturated_fat_g: 20,
  cholesterol_mg: 200,
};

/** `sparseSchemaNutrition` as a whole-recipe catalog total (× 4 servings). */
export const sparseCatalogTotal: IngredientNutrition = {
  calories_kcal: 1400,
  protein_g: 88,
};

/** `fullSchemaNutrition` in the parsed form the label adapters consume. */
export const fullNutrientValues = schemaNutritionToValues(fullSchemaNutrition);

/** `sparseSchemaNutrition` in the parsed form the label adapters consume. */
export const sparseNutrientValues =
  schemaNutritionToValues(sparseSchemaNutrition);
