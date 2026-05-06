import type { SchemaRecipe } from "@/types/recipe";

export const rescrapeFixture: SchemaRecipe = {
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
