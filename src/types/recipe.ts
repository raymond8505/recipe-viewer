import type { IngredientRow, RecipeIngredientRow } from "./ingredient";

/**
 * The object form of a Schema.org `recipeIngredient` entry as it arrives from
 * outside — a scrape, `create_recipe`, the window API — carrying this app's
 * `group` extension. Inbound only: `fromSchemaOrgIngredients` turns a list of
 * these (or bare strings) into write input, and nothing internal reads them.
 */
export interface SchemaOrgIngredientLine {
  name: string;
  group?: string;
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
export interface RecipeIngredient extends Omit<RecipeIngredientRow, "recipe_id"> {
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
 * The order the recipe list can be sorted in. It lives here rather than beside
 * `getRecipes` because SortBar (a client component) renders the options, and
 * `@/lib/recipes` reaches `@/env` at runtime — a client module must be able to
 * name this type without naming a server module to get it.
 */
export type SortOption = "newest" | "oldest" | "name-asc" | "name-desc";

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
  ingredients: StoredIngredientGroup[];
  metadata: { schema: SchemaRecipe };
}

/**
 * A recipe's content as the app carries it, independent of the row it came
 * from: the stored schema, the ingredient groups, and the three column-backed
 * times in seconds. Held together so an operation that replaces the whole
 * recipe (a re-scrape, an undo) does so atomically, and so the outbound
 * Schema.org edges (`toSchemaOrgRecipe` / `toSchemaOrgJsonLd`) read every
 * column-backed field from its column rather than from the blob's copy.
 * Built by `recipeDocument(row)` / `draftRecipeDocument(...)` in
 * src/lib/recipeDocument.ts.
 */
export interface RecipeDocument {
  schema: SchemaRecipe;
  ingredients: RecipeIngredientGroup[];
  prep_time: number | null;
  cook_time: number | null;
  total_time: number | null;
}

/**
 * A Schema.org/Recipe as served to the outside world: the stored fields plus
 * `recipeIngredient` flattened to plain strings. Produced only at the edges
 * (JSON-LD, webhooks, the window API); nothing internal reads it.
 */
export type SchemaOrgRecipe = SchemaRecipe & { recipeIngredient?: string[] };

/**
 * A recipe as the app passes it around: the row with its `ingredients` column
 * hydrated into groups of `RecipeIngredient` from the `recipe_ingredients`
 * rows the column names. Only the repo layer (`src/lib/recipes.ts`) builds one;
 * a reader that queries `recipes` directly gets `RecipeRowColumns` — ids, not
 * ingredients — and stale times.
 */
export interface RecipeRow extends Omit<RecipeRowColumns, "ingredients"> {
  ingredients: RecipeIngredientGroup[];
}

/**
 * One instruction step. `name` is the cook-mode timer label and `seconds` the
 * timer's duration in whole seconds; `seconds` only ever accompanies a `name`
 * — a timer needs a label, a label may stand alone. `canonicalizeInstructions`
 * (src/lib/recipeInstructions.ts) enforces that at every write.
 */
export interface RecipeStep {
  text: string;
  name?: string;
  seconds?: number;
}

/**
 * The unit of a recipe's instructions: a run of steps under an optional
 * heading. `name` is absent for a nameless group, as on RecipeIngredientGroup.
 * Order between groups is semantic — steps are sequential — so nameless groups
 * may sit on either side of a named one (never beside each other: canonical
 * form merges those).
 *
 * This is `recipes.instructions` as stored AND as the app carries it: a step
 * has no identity and no other table refers to one, so there is nothing to
 * hydrate.
 */
export interface RecipeInstructionGroup {
  name?: string;
  steps: RecipeStep[];
}

// Schema.org HowTo types — the wire form of a recipe's instructions. Produced
// by `toSchemaOrgInstructions` at the outbound edges and consumed by
// `fromSchemaOrgInstructions` at the inbound ones (src/lib/format.ts); nothing
// internal carries them.

export interface HowToStep {
  "@type"?: "HowToStep" | string;
  text: string;
  name?: string;
  timeRequired?: string;
}

/** A section as the app emits it. */
export interface HowToSection {
  "@type": "HowToSection";
  name: string;
  itemListElement: HowToStep[];
}

/** A section as a scraper actually sends it: `itemListElement` may be one step or missing. Inbound only. */
export interface SchemaOrgHowToSection extends Omit<HowToSection, "itemListElement"> {
  itemListElement?: HowToStep | HowToStep[];
}

export type SchemaOrgInstructionItem = string | HowToStep | SchemaOrgHowToSection;

/**
 * `recipeInstructions` as it arrives from outside: the array, a single item,
 * or a markdown string (a bare string at the top level is markdown; inside the
 * array it is one step's text).
 */
export type SchemaOrgInstructions = SchemaOrgInstructionItem | SchemaOrgInstructionItem[];

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
  // No `recipeIngredient`: a recipe's ingredients are `RecipeRow.ingredients`
  // (RecipeIngredientGroup[]), and the Schema.org list exists only on
  // SchemaOrgRecipe, at the edges. The key still sits in the stored blob of
  // every pre-0016 row, frozen at backfill time; the repo layer deletes it on
  // read and strips it on write so nothing above it can see it.
  /** @deprecated Moving to `RecipeRow.instructions` (RecipeInstructionGroup[]); the Schema.org array will exist only at the edges. */
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
