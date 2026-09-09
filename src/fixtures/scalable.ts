import {
  ScalableRecipe,
  type NormalizedNutrition,
  type ScaledIngredient,
  type ScalableRecipeState,
} from "@/lib/ScalableRecipe";
import type { IngredientNutrition } from "@/types/ingredient";
import type {
  QuantitativeValue,
  RecipeIngredientGroup,
  SchemaRecipe,
} from "@/types/recipe";
import { makeIngredientGroup, makeIngredientLines } from "./ingredients";

/**
 * Structured QuantitativeValue yield: 4 kebabs made from 454 g of raw
 * ingredients → per-serving weight 454/4 = 113.5 → "per 114 g serving". Shared
 * by the nutrition + yield tests/stories that exercise the new object form.
 */
export const quantitativeValueYield: QuantitativeValue = {
  "@type": "QuantitativeValue",
  value: 4,
  unitText: "kebabs",
  valueReference: { "@type": "QuantitativeValue", value: 454, unitText: "g" },
};

export const scalableBaseSchema: SchemaRecipe = {
  name: "Test Recipe",
  recipeYield: "4 servings",
  nutrition: {
    "@type": "NutritionInformation",
    calories: "200 kcal",
    proteinContent: "10 g",
    fatContent: "5 g",
  },
};

/** Four ungrouped lines (a single, a fraction, a range, an unparseable) and a
 *  named "Wet" group — the scaling tests' fixture list. */
export const scalableBaseIngredients: RecipeIngredientGroup[] = [
  makeIngredientGroup(undefined, [
    "2 cups flour",
    "1/2 tsp salt",
    "3-5 cloves garlic",
    "salt to taste",
  ]),
  makeIngredientGroup("Wet", ["1 cup butter", "1/4 cup sugar"]),
];

export function makeSchemaRecipe(
  overrides: Partial<SchemaRecipe> = {},
): SchemaRecipe {
  return { ...scalableBaseSchema, ...overrides };
}

export function makeScalableRecipe(
  overrides: {
    schema?: Partial<SchemaRecipe>;
    ingredients?: RecipeIngredientGroup[];
    /** The catalog-derived total. Omit for a recipe with no nutrition at all. */
    normalized?: NormalizedNutrition | null;
  } = {},
  state?: Partial<ScalableRecipeState>,
): ScalableRecipe {
  return new ScalableRecipe(
    makeSchemaRecipe(overrides.schema),
    overrides.ingredients ?? scalableBaseIngredients,
    state,
    overrides.normalized ?? null,
  );
}

/**
 * A recipe whose nutrition actually resolves: a fully-covered catalog total on
 * the four-serving base yield. Since `schema.nutrition` stopped being a source,
 * this is the only way to put numbers in front of the nutrition panel, and
 * nearly every panel case wants exactly this shape.
 *
 * `total` is the WHOLE-RECIPE sum and the panel divides it by the servings, so
 * pass 1400 kcal to read "350 kcal" per serving. Override `schema.recipeYield`
 * and the divisor moves with it — including to null, which is how a
 * no-parseable-yield case is built.
 *
 * `fullyCovered: false` is the "some line is unmatched" case: nutrition()
 * refuses to serve anything, so the panel falls to its empty shell.
 */
export function makeNutritionRecipe(
  total: IngredientNutrition,
  overrides: {
    schema?: Partial<SchemaRecipe>;
    ingredients?: RecipeIngredientGroup[];
    fullyCovered?: boolean;
  } = {},
  state?: Partial<ScalableRecipeState>,
): ScalableRecipe {
  return makeScalableRecipe(
    {
      ingredients: overrides.ingredients ?? [],
      schema: { recipeYield: "4 servings", ...overrides.schema },
      normalized: { total, fullyCovered: overrides.fullyCovered ?? true },
    },
    state,
  );
}

export function makeScaledIngredient(text: string, scale = 1): ScaledIngredient {
  const schema: SchemaRecipe = { name: "test", recipeYield: "1 serving" };
  return new ScalableRecipe(schema, makeIngredientLines([text]), {
    ingredientScale: scale,
  }).ingredients[0];
}
