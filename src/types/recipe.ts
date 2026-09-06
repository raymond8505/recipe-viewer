import type { RecipeIngredientRow } from "./ingredient";

export interface RecipeIngredient {
  name: string;
  group?: string;
  /**
   * The `recipe_ingredients` row this line IS (db/migrations/0016). Text and
   * position move freely underneath it: rewording updates the row's raw_text,
   * reordering moves the id within `recipes.ingredients`, and the association a
   * user curated on the row survives both.
   *
   * Optional only on the way IN — a caller (an MCP `update_recipe`, a re-scrape)
   * may send bare strings, and the write path mints a row for each. Every line
   * composed OUT of storage carries one.
   */
  id?: string;
}

/**
 * One ingredient group as stored in `recipes.ingredients` (db/migrations/0016).
 * The group's position is its index in that array, and a line's position is its
 * index in `ingredients` — nothing tracks either separately.
 */
export interface RecipeIngredientGroup {
  /** Absent when the recipe is ungrouped (then there is exactly one group). */
  name?: string;
  /** Ordered `recipe_ingredients.id` values. */
  ingredients: string[];
}

/**
 * What `metadata.schema` still holds: a Schema.org Recipe minus the two fields
 * that are now their own columns. Nothing should read the two off this type —
 * that's what the composer is for (src/lib/recipeSchema.ts).
 */
export type StoredRecipeSchema = Omit<
  SchemaRecipe,
  "recipeIngredient" | "recipeInstructions"
>;

/**
 * The `recipes` table, column for column. Separate from `RecipeRow` because
 * `selectColumns<Row>()` is exhaustive over the type it's given — a field that
 * isn't a column can't appear on the type it checks.
 */
export interface RecipeRowColumns {
  id: string;
  url: string;
  source: string;
  status: "published" | "archived" | "draft" | null;
  ingredients: RecipeIngredientGroup[];
  instructions: Array<HowToStep | HowToSection>;
  metadata: { schema: StoredRecipeSchema };
}

/**
 * A recipe as the app passes it around: the row plus the `recipe_ingredients`
 * rows its `ingredients` groups point at. The two together are what
 * `composeRecipeSchema` turns back into a whole SchemaRecipe — the row alone
 * cannot render an ingredient list, because since db/migrations/0016 the line
 * text lives on those rows.
 */
export interface RecipeRow extends RecipeRowColumns {
  ingredientRows: RecipeIngredientRow[];
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
