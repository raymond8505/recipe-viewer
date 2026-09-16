import { parseDurationToSeconds, stripSchemaOrgKeys } from "./format";
import { draftIngredientGroups } from "./recipeIngredients";
import { parseYield } from "./units";
import type {
  RecipeDocument,
  RecipeDocumentSource,
  RecipeIngredientGroupInput,
  RecipeInstructionGroup,
  RecipeRow,
  SchemaOrgRecipe,
} from "@/types/recipe";

// The two ways a RecipeDocument comes to exist. Client-safe on purpose:
// RecipeDetail and CookingMode build documents, and neither may reach @/env.

/** The row's content, columns and all — what a page hands its client component. */
export function recipeDocument(row: RecipeDocumentSource): RecipeDocument {
  return {
    schema: row.metadata.schema,
    ingredients: row.ingredients,
    instructions: row.instructions,
    prep_time: row.prep_time,
    cook_time: row.cook_time,
    total_time: row.total_time,
    servings_amount: row.servings_amount,
    servings_unit: row.servings_unit,
    total_weight_amount: row.total_weight_amount,
    total_weight_unit: row.total_weight_unit,
  };
}

/**
 * The inverse of `recipeDocument`: the row with the document's content laid
 * over it, for a consumer that takes a `RecipeRow` (cook mode) when the page
 * has moved on from the row it was served — a saved edit, a re-scrape.
 */
export function applyRecipeDocument(row: RecipeRow, doc: RecipeDocument): RecipeRow {
  // Every column-backed field is listed explicitly. `...row` already supplies
  // one of each, of exactly the right type — just the stale one — so an
  // omission here is a silent revert the compiler cannot see.
  return {
    ...row,
    metadata: { ...row.metadata, schema: doc.schema },
    ingredients: doc.ingredients,
    instructions: doc.instructions,
    prep_time: doc.prep_time,
    cook_time: doc.cook_time,
    total_time: doc.total_time,
    servings_amount: doc.servings_amount,
    servings_unit: doc.servings_unit,
    total_weight_amount: doc.total_weight_amount,
    total_weight_unit: doc.total_weight_unit,
  };
}

/**
 * A document for content that is not saved yet — a re-scrape under review.
 * This is an INBOUND Schema.org edge, so it is where the wire forms are reduced
 * to columns exactly once: the times from ISO strings, the yield from whatever
 * of the three shapes the source wrote. The lines are drafted from text, the
 * instructions taken as given, and every edge-only key is stripped off the
 * schema it keeps — `parseYield` has already read the yield, and leaving the
 * string on the blob is what would let a later reader parse it again.
 *
 * An unparseable yield leaves all four columns null rather than guessing: a
 * wrong serving count silently rescales the whole recipe.
 *
 * `instructions` is required rather than defaulted: an omitted argument is
 * exactly the forgotten-field bug the single-document shape exists to prevent.
 */
export function draftRecipeDocument(
  schema: SchemaOrgRecipe,
  ingredients: readonly RecipeIngredientGroupInput[],
  instructions: readonly RecipeInstructionGroup[],
): RecipeDocument {
  const yld = parseYield(schema.recipeYield);
  return {
    schema: stripSchemaOrgKeys(schema),
    ingredients: draftIngredientGroups(ingredients),
    instructions: [...instructions],
    prep_time: parseDurationToSeconds(schema.prepTime),
    cook_time: parseDurationToSeconds(schema.cookTime),
    total_time: parseDurationToSeconds(schema.totalTime),
    servings_amount: yld?.amount ?? null,
    servings_unit: yld?.unit ?? null,
    total_weight_amount: yld?.weight?.amount ?? null,
    total_weight_unit: yld?.weight?.unit ?? null,
  };
}
