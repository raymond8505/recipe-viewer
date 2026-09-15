import {
  ScalableRecipe,
  type NormalizedNutrition,
  type ScaledIngredient,
  type ScalableRecipeState,
} from "@/lib/ScalableRecipe";
import type { IngredientNutrition } from "@/types/ingredient";
import type {
  RecipeDocument,
  RecipeIngredientGroup,
  SchemaRecipe,
} from "@/types/recipe";
import { makeIngredientGroup, makeIngredientLines } from "./ingredients";

/**
 * The servings columns for a weighed recipe: 4 kebabs made from 454 g of raw
 * ingredients → per-serving weight 454/4 = 113.5 → "per 114 g serving". Shared
 * by the nutrition and yield tests/stories that need a whole-recipe weight.
 */
export const weighedYieldColumns = {
  servings_amount: 4,
  servings_unit: "kebabs",
  total_weight_amount: 454,
  total_weight_unit: "g",
} satisfies Pick<
  RecipeDocument,
  "servings_amount" | "servings_unit" | "total_weight_amount" | "total_weight_unit"
>;

/** The stored blob. Its `nutrition` block is inert — the catalog is the only
 *  source — and it is kept here precisely so tests can prove it is ignored. */
export const scalableBaseSchema: SchemaRecipe = {
  name: "Test Recipe",
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

/**
 * A document for the scaling fixtures: the base schema and lines over a
 * four-serving count. Servings are columns, so they are set here rather than in
 * `schema` — pass `servings_amount: null` for the no-serving-count case.
 */
export function makeScalableDocument(
  overrides: Partial<RecipeDocument> & { schema?: Partial<SchemaRecipe> } = {},
): RecipeDocument {
  const { schema, ...columns } = overrides;
  return {
    schema: makeSchemaRecipe(schema),
    ingredients: scalableBaseIngredients,
    instructions: [],
    prep_time: null,
    cook_time: null,
    total_time: null,
    servings_amount: 4,
    servings_unit: "servings",
    total_weight_amount: null,
    total_weight_unit: null,
    ...columns,
  };
}

export function makeScalableRecipe(
  overrides: {
    schema?: Partial<SchemaRecipe>;
    ingredients?: RecipeIngredientGroup[];
    /** The catalog-derived total. Omit for a recipe with no nutrition at all. */
    normalized?: NormalizedNutrition | null;
  } & Partial<RecipeDocument> = {},
  state?: Partial<ScalableRecipeState>,
): ScalableRecipe {
  const { normalized, ...doc } = overrides;
  return new ScalableRecipe(
    makeScalableDocument(doc),
    state,
    normalized ?? null,
  );
}

/**
 * A recipe whose nutrition actually resolves: a fully-covered catalog total on
 * the four-serving base count. Since `schema.nutrition` stopped being a source,
 * this is the only way to put numbers in front of the nutrition panel, and
 * nearly every panel case wants exactly this shape.
 *
 * `total` is the WHOLE-RECIPE sum and the panel divides it by the servings, so
 * pass 1400 kcal to read "350 kcal" per serving. Override `servings_amount` and
 * the divisor moves with it — including to null, which is how the
 * no-serving-count case is built.
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
  } & Partial<RecipeDocument> = {},
  state?: Partial<ScalableRecipeState>,
): ScalableRecipe {
  const { fullyCovered, ...doc } = overrides;
  return makeScalableRecipe(
    {
      ingredients: [],
      ...doc,
      normalized: { total, fullyCovered: fullyCovered ?? true },
    },
    state,
  );
}

export function makeScaledIngredient(text: string, scale = 1): ScaledIngredient {
  return new ScalableRecipe(
    makeScalableDocument({
      schema: { name: "test" },
      ingredients: makeIngredientLines([text]),
      servings_amount: 1,
      servings_unit: "serving",
    }),
    { ingredientScale: scale },
  ).ingredients[0];
}
