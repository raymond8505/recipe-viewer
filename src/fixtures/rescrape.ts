import { draftRecipeDocument } from "@/lib/recipeDocument";
import { fromSchemaOrgIngredients } from "@/lib/recipeIngredients";
import type { RecipeDocument, SchemaOrgRecipe, SchemaRecipe } from "@/types/recipe";

/** What the re-scrape webhook returns: a Schema.org Recipe, lines as strings. */
export const rescrapeFixture: SchemaOrgRecipe = {
  name: "Re-scraped Chocolate Cake",
  description: "Freshly scraped version of the recipe.",
  recipeIngredient: ["2 cups flour", "1 cup sugar", "1/2 cup cocoa powder"],
  recipeInstructions: [
    { "@type": "HowToStep", text: "Preheat oven to 350°F." },
    { "@type": "HowToStep", text: "Mix dry ingredients." },
    { "@type": "HowToStep", text: "Bake for 30 minutes." },
  ],
  totalTime: "PT45M",
  recipeYield: "12 servings",
};

const { recipeIngredient, ...rescrapeSchema } = rescrapeFixture;

/** The same recipe as the /rescrape route hands it to the client: split at the edge. */
export const rescrapeResponseFixture: {
  schema: SchemaRecipe;
  ingredients: ReturnType<typeof fromSchemaOrgIngredients>;
} = {
  schema: rescrapeSchema,
  ingredients: fromSchemaOrgIngredients(recipeIngredient ?? []),
};

/** The same recipe as /update echoes it after a save: every line a row with
 *  an id, the times as column seconds (PT45M → 2700). */
export const rescrapeSavedFixture: RecipeDocument = draftRecipeDocument(
  rescrapeSchema,
  rescrapeResponseFixture.ingredients,
);
