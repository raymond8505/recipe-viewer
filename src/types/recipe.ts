export interface RecipeIngredient {
  name: string;
  group?: string;
}

export interface RecipeRow {
  id: string;
  url: string;
  source: string;
  status: "published" | "archived" | "draft" | null;
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

/**
 * Schema.org/QuantitativeValue — the structured form of `recipeYield`.
 * At the top level: `value` is the serving count (SSoT) and `unitText` its
 * label (e.g. 4 + "kebabs"). `valueReference` nests a second QuantitativeValue
 * holding the recipe's raw weight/volume (e.g. 454 + "g"), which drives the
 * per-serving basis shown in the nutrition panel (valueReference.value / value).
 * A plain-string `recipeYield` remains valid (legacy/deprecated); an object
 * signals the new system.
 */
export interface QuantitativeValue {
  "@type"?: "QuantitativeValue";
  value?: number;
  unitText?: string;
  valueReference?: QuantitativeValue;
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
  recipeYield?: string | string[] | QuantitativeValue;
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
  cookingNotes?: string;
}

export interface RecipesResult {
  data: RecipeRow[];
  count: number;
}
