import type { IngredientRow, RecipeIngredientRow } from "./ingredient";

export interface SchemaOrgIngredientLine {
  name: string;
  group?: string;
  /**
   * Stable identity of this line, independent of its text and its position.
   * `recipe_ingredients.line_id` points at it, so the derived row — and any
   * association a user curated on it — survives rewording, reordering, and
   * insertions above it.
   *
   * Optional only because legacy rows predate it and plain-string lines can't
   * carry one; the write path (`withLineIds`) mints one for every line it
   * persists, so anything saved since is guaranteed to have it. Custom field:
   * deliberately absent from `toSchemaOrgJsonLd` output.
   */
  id?: string;
}

/**
 * One ingredient of a recipe, as the app thinks about it: the
 * `recipe_ingredients` row IS the ingredient. `id` is its identity (what
 * `recipes.ingredients` points at), `raw_text` is what the recipe says, the
 * parse fields and the catalog association ride along.
 *
 * `recipe_id` is deliberately absent: inside a recipe it is redundant, and an
 * ingredient drafted client-side (a re-scrape under review, a recipe handed in
 * through the window API) has no recipe row yet.
 */
export interface RecipeIngredient
  extends Omit<RecipeIngredientRow, "recipe_id" | "line_id" | "position"> {
  /**
   * The catalog ingredient this line resolves to. `undefined` means the
   * catalog was not loaded (list queries hydrate rows only); `null` means it
   * was loaded and the line is unmatched. Nutrition math treats both as "no
   * catalog data", so a list-page row never computes a total by accident.
   */
  ingredient?: IngredientRow | null;
}

/**
 * The unit of a recipe's ingredient list. An ungrouped recipe is exactly one
 * group with no `name`; a grouped one is several, each named. Position is the
 * array index at both levels — nothing tracks it separately.
 */
export interface RecipeIngredientGroup {
  name?: string;
  ingredients: RecipeIngredient[];
}

/**
 * `recipes.ingredients` as stored (db/migrations/0016): the same groups, but
 * each line is just the row id. The repo layer is the only reader and writer;
 * everything above it sees `RecipeIngredientGroup`.
 */
export interface StoredIngredientGroup {
  name?: string;
  ingredients: string[];
}

/**
 * What a writer sends for one ingredient. `id` names the row the line already
 * is — send it back to keep the row (and the catalog association curated on
 * it); leave it off for a genuinely new line and the write path mints one.
 */
export interface RecipeIngredientLineInput {
  id?: string;
  raw_text: string;
}

export interface RecipeIngredientGroupInput {
  name?: string;
  ingredients: RecipeIngredientLineInput[];
}

/**
 * The `recipes` table, column for column — what `selectColumns<>` is checked
 * against. `RecipeRow` is this with `ingredients` hydrated from the second
 * table, which is why the two are separate types.
 */
export interface RecipeRowColumns {
  id: string;
  url: string;
  source: string;
  status: "published" | "archived" | "draft" | null;
  prep_time: number | null;
  cook_time: number | null;
  total_time: number | null;
  ingredients: StoredIngredientGroup[];
  metadata: { schema: SchemaRecipe };
}

/**
 * The client's unit of recipe state: the non-ingredient fields plus the
 * ingredient groups, held together so an operation that replaces both (a
 * re-scrape, an undo) does so atomically.
 */
export interface RecipeDocument {
  schema: SchemaRecipe;
  ingredients: RecipeIngredientGroup[];
}

/**
 * A Schema.org/Recipe as served to the outside world: the stored fields plus
 * `recipeIngredient` flattened to plain strings. Produced only at the edges
 * (JSON-LD, webhooks, the window API); nothing internal reads it.
 */
export type SchemaOrgRecipe = Omit<SchemaRecipe, "recipeIngredient"> & {
  recipeIngredient?: string[];
};

export interface RecipeRow {
  id: string;
  url: string;
  source: string;
  status: "published" | "archived" | "draft" | null;
  /**
   * Whole seconds; null means no time recorded. These three are the source of
   * truth for a recipe's times — `metadata.schema.{prepTime,cookTime,totalTime}`
   * still holds a pre-0019 copy on older rows, but the repo layer overwrites it
   * from these columns on every read and never writes it again. See the
   * hydrate/extract seam in .claude/docs/supabase-data-layer.md.
   *
   * Seconds, not minutes, so the column can hold any ISO 8601 duration a
   * scraper produces without rounding. The editor is coarser (HH:MM) — that
   * asymmetry is deliberate and documented on `formatTimeInput`.
   */
  prep_time: number | null;
  cook_time: number | null;
  total_time: number | null;
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
  // ISO 8601 durations, backed by the recipes.{prep,cook,total}_time columns.
  // Explicitly nullable so a patch can CLEAR a time: `undefined` disappears in
  // JSON and would read as "field absent, leave it alone" after the round trip.
  cookTime?: string | null;
  prepTime?: string | null;
  totalTime?: string | null;
  recipeYield?: string | string[] | QuantitativeValue;
  recipeCuisine?: string;
  recipeCategory?: string | string[];
  /** @deprecated Being replaced by `RecipeRow.ingredients` (`RecipeIngredientGroup[]`). */
  recipeIngredient?: Array<string | SchemaOrgIngredientLine>;
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
