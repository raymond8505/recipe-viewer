export interface RecipeIngredient {
  name: string;
  group?: string;
}

export interface RecipeRow {
  id: string;
  url: string;
  source: string;
  metadata: { schema: SchemaRecipe };
}

export interface HowToStep {
  "@type"?: "HowToStep" | string;
  text: string;
  name?: string;
  timeRequired?: string;
}

export interface HowToSection {
  "@type": "HowToSection";
  name: string;
  itemListElement: HowToStep[];
}

export interface SchemaRecipe {
  "@context"?: string;
  "@type"?: "Recipe";
  name: string;
  description?: string;
  image?: string | string[];
  author?: { "@type"?: "Person"; name: string };
  cookTime?: string;
  prepTime?: string;
  totalTime?: string;
  recipeYield?: string | string[];
  recipeCuisine?: string;
  recipeCategory?: string | string[];
  recipeIngredient?: Array<string | RecipeIngredient>;
  recipeInstructions?: Array<HowToStep | HowToSection>;
  keywords?: string;
  nutrition?: {
    "@type"?: "NutritionInformation";
    servingSize?: string;
    calories?: string;
    proteinContent?: string;
    carbohydrateContent?: string;
    fatContent?: string;
    fiberContent?: string;
    sodiumContent?: string;
    sugarContent?: string;
    saturatedFatContent?: string;
    unsaturatedFatContent?: string;
    cholesterolContent?: string;
  };
  datePublished?: string;
  notes?: string;
}

export interface RecipesResult {
  data: RecipeRow[];
  count: number;
}
