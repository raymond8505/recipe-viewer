import { fromSchemaOrgInstructions, parseDurationToSeconds } from "./format";
import { draftIngredientGroups, fromSchemaOrgIngredients } from "./recipeIngredients";
import type {
  RecipeDocument,
  RecipeIngredientGroupInput,
  RecipeInstructionGroup,
  RecipeRow,
  SchemaOrgRecipe,
  SchemaRecipe,
} from "@/types/recipe";

// The three ways a RecipeDocument comes to exist. Client-safe on purpose:
// RecipeDetail, CookingMode and the window API build documents, and none of
// them may reach @/env.

/** The row's content, columns and all — what a page hands its client component. */
export function recipeDocument(
  row: Pick<
    RecipeRow,
    "metadata" | "ingredients" | "instructions" | "prep_time" | "cook_time" | "total_time"
  >,
): RecipeDocument {
  return {
    schema: row.metadata.schema,
    ingredients: row.ingredients,
    instructions: row.instructions,
    prep_time: row.prep_time,
    cook_time: row.cook_time,
    total_time: row.total_time,
  };
}

/**
 * The inverse of `recipeDocument`: the row with the document's content laid
 * over it, for a consumer that takes a `RecipeRow` (cook mode) when the page
 * has moved on from the row it was served — a saved edit, a re-scrape.
 */
export function applyRecipeDocument(row: RecipeRow, doc: RecipeDocument): RecipeRow {
  return {
    ...row,
    metadata: { ...row.metadata, schema: doc.schema },
    ingredients: doc.ingredients,
    instructions: doc.instructions,
    prep_time: doc.prep_time,
    cook_time: doc.cook_time,
    total_time: doc.total_time,
  };
}

/**
 * A document for content that is not saved yet — a re-scrape under review.
 * The times come from the schema's ISO strings (a scrape speaks Schema.org),
 * the lines are drafted from text, the instructions are taken as given.
 * `instructions` is required rather than defaulted: an omitted argument is
 * exactly the forgotten-field bug the single-document shape exists to prevent.
 */
export function draftRecipeDocument(
  schema: SchemaRecipe,
  ingredients: readonly RecipeIngredientGroupInput[],
  instructions: readonly RecipeInstructionGroup[],
): RecipeDocument {
  return {
    schema,
    ingredients: draftIngredientGroups(ingredients),
    instructions: [...instructions],
    prep_time: parseDurationToSeconds(schema.prepTime),
    cook_time: parseDurationToSeconds(schema.cookTime),
    total_time: parseDurationToSeconds(schema.totalTime),
  };
}

/** The inbound Schema.org edge: a whole Schema.org Recipe → a draft document. */
export function documentFromSchemaOrg(recipe: SchemaOrgRecipe): RecipeDocument {
  const { recipeIngredient, recipeInstructions, ...schema } = recipe;
  return draftRecipeDocument(
    schema,
    fromSchemaOrgIngredients(recipeIngredient ?? []),
    fromSchemaOrgInstructions(recipeInstructions),
  );
}
