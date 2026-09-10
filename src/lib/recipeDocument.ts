import { parseDurationToSeconds } from "./format";
import { draftIngredientGroups, fromSchemaOrgIngredients } from "./recipeIngredients";
import type {
  RecipeDocument,
  RecipeIngredientGroupInput,
  RecipeRow,
  SchemaOrgRecipe,
  SchemaRecipe,
} from "@/types/recipe";

// The three ways a RecipeDocument comes to exist. Client-safe on purpose:
// RecipeDetail, CookingMode and the window API build documents, and none of
// them may reach @/env.

/** The row's content, columns and all — what a page hands its client component. */
export function recipeDocument(
  row: Pick<RecipeRow, "metadata" | "ingredients" | "prep_time" | "cook_time" | "total_time">,
): RecipeDocument {
  return {
    schema: row.metadata.schema,
    ingredients: row.ingredients,
    prep_time: row.prep_time,
    cook_time: row.cook_time,
    total_time: row.total_time,
  };
}

/**
 * A document for content that is not saved yet — a re-scrape under review.
 * The times come from the schema's ISO strings (a scrape speaks Schema.org),
 * the lines are drafted from text.
 */
export function draftRecipeDocument(
  schema: SchemaRecipe,
  ingredients: readonly RecipeIngredientGroupInput[],
): RecipeDocument {
  return {
    schema,
    ingredients: draftIngredientGroups(ingredients),
    prep_time: parseDurationToSeconds(schema.prepTime),
    cook_time: parseDurationToSeconds(schema.cookTime),
    total_time: parseDurationToSeconds(schema.totalTime),
  };
}

/** The inbound Schema.org edge: a whole Schema.org Recipe → a draft document. */
export function documentFromSchemaOrg(recipe: SchemaOrgRecipe): RecipeDocument {
  const { recipeIngredient, ...schema } = recipe;
  return draftRecipeDocument(schema, fromSchemaOrgIngredients(recipeIngredient ?? []));
}
