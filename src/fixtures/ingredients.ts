import { newRecipeIngredient } from "@/lib/recipeIngredients";
import type {
  IngredientRow,
  RecipeIngredientRow,
} from "@/types/ingredient";
import type { RecipeIngredient, RecipeIngredientGroup } from "@/types/recipe";

// Realistic catalog rows. Nutrition values are real USDA per-100g figures
// (cumin: SR Legacy fdcId 170923 — the same payload the usda.ts tests fixture);
// densities derive from each food's USDA foodPortions.

export const ingredientFixtures: IngredientRow[] = [
  {
    id: "a1f86eb6-6f3e-4f65-9d55-0d5c3a2c9101",
    name: "cumin seed",
    aliases: ["whole cumin", "cumin seeds"],
    fdc_id: 170923,
    fdc_data_type: "SR Legacy",
    nutrition: {
      calories_kcal: 375,
      protein_g: 17.81,
      fat_g: 22.27,
      saturated_fat_g: 1.535,
      carbs_g: 44.24,
      fiber_g: 10.5,
      sugars_g: 2.25,
      sodium_mg: 168,
      cholesterol_mg: 0,
      calcium_mg: 931,
      iron_mg: 66.36,
      potassium_mg: 1788,
    },
    density_g_per_ml: 0.42,
    food_portions: [
      {
        gramWeight: 2.1,
        amount: 1,
        modifier: "tsp, whole",
        measureUnit: { name: "undetermined" },
      },
      {
        gramWeight: 6,
        amount: 1,
        modifier: "tbsp, whole",
        measureUnit: { name: "undetermined" },
      },
    ],
    source: "usda",
    created_at: "2026-07-01T12:00:00.000Z",
    updated_at: "2026-07-01T12:00:00.000Z",
  },
  {
    id: "b2c97fc7-7a4f-4a76-8e66-1e6d4b3da202",
    name: "all-purpose flour",
    aliases: ["plain flour", "ap flour"],
    fdc_id: 169761,
    fdc_data_type: "SR Legacy",
    nutrition: {
      calories_kcal: 364,
      protein_g: 10.33,
      fat_g: 0.98,
      saturated_fat_g: 0.155,
      carbs_g: 76.31,
      fiber_g: 2.7,
      sugars_g: 0.27,
      sodium_mg: 2,
      cholesterol_mg: 0,
      calcium_mg: 15,
      iron_mg: 4.64,
      potassium_mg: 107,
    },
    density_g_per_ml: 0.53,
    food_portions: [
      {
        gramWeight: 125,
        amount: 1,
        modifier: "cup",
        measureUnit: { name: "undetermined" },
      },
    ],
    source: "usda",
    created_at: "2026-07-01T12:00:00.000Z",
    updated_at: "2026-07-01T12:00:00.000Z",
  },
  {
    id: "c3da80d8-8b50-4b87-9f77-2f7e5c4eb303",
    name: "olive oil",
    aliases: ["extra virgin olive oil", "evoo"],
    fdc_id: 171413,
    fdc_data_type: "SR Legacy",
    nutrition: {
      calories_kcal: 884,
      protein_g: 0,
      fat_g: 100,
      saturated_fat_g: 13.808,
      carbs_g: 0,
      fiber_g: 0,
      sugars_g: 0,
      sodium_mg: 2,
      cholesterol_mg: 0,
      calcium_mg: 1,
      iron_mg: 0.56,
      potassium_mg: 1,
    },
    density_g_per_ml: 0.92,
    food_portions: [
      {
        gramWeight: 13.5,
        amount: 1,
        modifier: "tbsp",
        measureUnit: { name: "undetermined" },
      },
    ],
    source: "usda",
    created_at: "2026-07-01T12:00:00.000Z",
    updated_at: "2026-07-01T12:00:00.000Z",
  },
  {
    id: "d4eb91e9-9c61-4c98-a088-3a8f6d5fc404",
    name: "kosher salt",
    aliases: ["coarse salt"],
    fdc_id: null,
    fdc_data_type: null,
    nutrition: {
      calories_kcal: 0,
      sodium_mg: 38758,
    },
    density_g_per_ml: 1.2,
    food_portions: null,
    source: "manual",
    created_at: "2026-07-02T12:00:00.000Z",
    updated_at: "2026-07-03T09:30:00.000Z",
  },
  {
    id: "e5fca2fa-ad72-4da9-b199-4b9a7e60d505",
    name: "yellow onion",
    aliases: ["onion", "cooking onion"],
    fdc_id: 170000,
    fdc_data_type: "SR Legacy",
    nutrition: {
      calories_kcal: 40,
      protein_g: 1.1,
      fat_g: 0.1,
      saturated_fat_g: 0.042,
      carbs_g: 9.34,
      fiber_g: 1.7,
      sugars_g: 4.24,
      sodium_mg: 4,
      cholesterol_mg: 0,
      calcium_mg: 23,
      iron_mg: 0.21,
      potassium_mg: 146,
    },
    density_g_per_ml: null,
    food_portions: null,
    source: "usda",
    created_at: "2026-07-02T12:00:00.000Z",
    updated_at: "2026-07-02T12:00:00.000Z",
  },
];

// Minimal factory for one-off fixture needs, mirroring makeRecipe.
export function makeIngredient(
  id: string,
  name: string,
  overrides?: Partial<IngredientRow>,
): IngredientRow {
  return {
    id,
    name,
    aliases: [],
    fdc_id: null,
    fdc_data_type: null,
    nutrition: null,
    density_g_per_ml: null,
    food_portions: null,
    source: "usda",
    created_at: "2026-07-01T12:00:00.000Z",
    updated_at: "2026-07-01T12:00:00.000Z",
    ...overrides,
  };
}

/** A `recipe_ingredients` row for repo-layer tests; `n` only distinguishes ids. */
export function makeRecipeIngredientRow(
  recipeId: string,
  n: number,
  overrides?: Partial<RecipeIngredientRow>,
): RecipeIngredientRow {
  return {
    id: `ri-${recipeId}-${n}`,
    recipe_id: recipeId,
    ingredient_id: null,
    raw_text: "1 tsp cumin seed",
    quantity: 1,
    unit: "tsp",
    name_text: "cumin seed",
    note: null,
    match_status: "unmatched",
    confidence: null,
    estimated_grams: null,
    grams_source: null,
    ...overrides,
  };
}

/**
 * One ingredient as the app carries it. The id is derived from the text
 * (`ri-2-tsp-cumin-seed`) so an assertion can name a line without a lookup;
 * pass `id` in `overrides` when two lines share their text. Parse fields come
 * from the deterministic parser, so "2 tsp cumin seed" arrives with quantity 2
 * and unit "tsp" without the fixture restating them.
 */
export function makeRecipeIngredient(
  text: string,
  overrides?: Partial<RecipeIngredient>,
): RecipeIngredient {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { ...newRecipeIngredient(text, `ri-${slug}`), ...overrides };
}

/** A group from a mix of bare texts and ready-made ingredients; `undefined` name = the nameless group. */
export function makeIngredientGroup(
  name: string | undefined,
  items: Array<string | RecipeIngredient>,
): RecipeIngredientGroup {
  return {
    ...(name != null ? { name } : {}),
    ingredients: items.map((item) =>
      typeof item === "string" ? makeRecipeIngredient(item) : item,
    ),
  };
}

/** The common case: an ungrouped list, as one nameless group. */
export function makeIngredientLines(
  texts: Array<string | RecipeIngredient>,
): RecipeIngredientGroup[] {
  return [makeIngredientGroup(undefined, texts)];
}

/** An ingredient matched to a catalog row, with the row attached — the shape a
 *  hydrated detail read produces. */
export function makeMatchedIngredient(
  text: string,
  ingredient: IngredientRow,
  overrides?: Partial<RecipeIngredient>,
): RecipeIngredient {
  return makeRecipeIngredient(text, {
    ingredient_id: ingredient.id,
    ingredient,
    match_status: "matched",
    ...overrides,
  });
}

/**
 * The plain "nothing interesting is wrong" NutritionDetail scenario: two lines,
 * both matched to the catalog, both convertible to grams. Named and fully
 * defined so stories about *something else* — editing a line's text, confirming
 * a re-normalization — can state that one thing and inherit a working recipe,
 * instead of restating an identical pair of rows each time.
 *
 * Reach for this whenever the recipe data is incidental to what a story shows.
 * Scenarios where the data IS the point (interleaved groups, an exclusion, a
 * missing yield) stay with their story, where the reader can see what makes
 * them special.
 */
export const matchedLinesScenario: {
  ingredients: RecipeIngredientGroup[];
  recipeYield: string;
} = {
  ingredients: makeIngredientLines([
    makeMatchedIngredient("2 tsp cumin seed", ingredientFixtures[0]),
    makeMatchedIngredient("1 tbsp olive oil", ingredientFixtures[2]),
  ]),
  recipeYield: "2 servings",
};
