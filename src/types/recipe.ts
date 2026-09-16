import type { IngredientRow, RecipeIngredientRow } from "./ingredient";

/**
 * The object form of a Schema.org `recipeIngredient` entry as it arrives from
 * outside — a scrape, `create_recipe` — carrying this app's
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
 * ingredient drafted client-side (a re-scrape under review) has no recipe row
 * yet.
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
  /**
   * How many servings the recipe makes at base scale, and what it counts them
   * in. Source of truth for both (0022) — `metadata.schema.recipeYield` holds a
   * pre-0022 copy on older rows that nothing may read, and unlike the times
   * there is no hydrate-back: readers take the columns.
   *
   * `servings_amount` null means no serving count is known, which disables
   * scaling and reports no per-serving nutrition; 1 would instead assert a
   * one-serving recipe. `servings_unit` is PLURAL as the source wrote it
   * ("servings", "kebabs"), and null means the source named none — callers fall
   * back to `SERVINGS_UNIT_FALLBACK` (src/lib/format.ts) rather than a column
   * default, so the fallback has one home.
   */
  servings_amount: number | null;
  servings_unit: string | null;
  /**
   * Raw weight or volume of the WHOLE recipe at base servings, divided by the
   * displayed portion count to label nutrition "per 114 g serving". Null in
   * both columns together. The unit stays beside the amount because there is no
   * honest ml→g without a density, and because it is rendered verbatim.
   */
  total_weight_amount: number | null;
  total_weight_unit: string | null;
  ingredients: StoredIngredientGroup[];
  /** The stored shape IS the app shape — see RecipeInstructionGroup. */
  instructions: RecipeInstructionGroup[];
  metadata: { schema: SchemaRecipe };
}

/**
 * A recipe's content as the app carries it, independent of the row it came
 * from: the stored schema, the ingredient groups, the instruction groups, and
 * the three column-backed times in seconds. Held together so an operation that
 * replaces the whole recipe (a re-scrape, an undo) does so atomically, and so
 * the outbound Schema.org edges (`toSchemaOrgRecipe` / `toSchemaOrgJsonLd`)
 * read every column-backed field from its column rather than from the blob's
 * copy. Built by `recipeDocument(row)` / `draftRecipeDocument(...)` in
 * src/lib/recipeDocument.ts.
 */
export interface RecipeDocument {
  schema: SchemaRecipe;
  ingredients: RecipeIngredientGroup[];
  instructions: RecipeInstructionGroup[];
  prep_time: number | null;
  cook_time: number | null;
  total_time: number | null;
  /** See RecipeRowColumns — same meaning, carried on the document. */
  servings_amount: number | null;
  servings_unit: string | null;
  total_weight_amount: number | null;
  total_weight_unit: string | null;
}

/**
 * A Schema.org/Recipe as served to the outside world: the stored fields plus
 * `recipeIngredient` flattened to plain strings and `recipeInstructions` as
 * the HowTo array. Produced only at the edges (JSON-LD, webhooks); nothing
 * internal reads it.
 */
export type SchemaOrgRecipe = SchemaRecipe & {
  recipeIngredient?: string[];
  recipeInstructions?: Array<HowToStep | HowToSection>;
  /**
   * The wire form of the `servings_amount` / `servings_unit` /
   * `total_weight_*` columns. Outbound it is always the QuantitativeValue
   * `schemaOrgYield` builds; inbound a scraper or agent may send any of the
   * three shapes, which `parseYield` reduces to the columns exactly once.
   */
  recipeYield?: string | string[] | QuantitativeValue;
  nutrition?: SchemaOrgNutrition;
};

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

// Schema.org HowTo types — the wire form of a recipe's instructions, the same
// in both directions: `recipeInstructions` is an array of these. Produced by
// `toSchemaOrgInstructions` at the outbound edges and consumed by
// `fromSchemaOrgInstructions` at the inbound ones (src/lib/format.ts), where
// `schemaOrgRecipeInputSchema` validates them; nothing internal carries them.

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
 * Schema.org/QuantitativeValue — the structured form of `recipeYield`, and a
 * WIRE type only: it is what the edges speak, never what the app carries.
 * At the top level `value` + `unitText` are the `servings_amount` /
 * `servings_unit` columns (4 + "kebabs"); the nested `valueReference` is
 * `total_weight_amount` / `total_weight_unit` (454 + "g"), the whole recipe's
 * raw weight. A plain-string `recipeYield` is still accepted inbound and
 * parsed; nothing emits one.
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
  recipeCuisine?: string;
  recipeCategory?: string | string[];
  // No `recipeIngredient`, `recipeInstructions` or `recipeYield`, and no
  // `nutrition.servingSize`: a recipe's ingredients are `RecipeRow.ingredients`
  // (RecipeIngredientGroup[]), its instructions `RecipeRow.instructions`
  // (RecipeInstructionGroup[]), and its servings the `servings_amount` /
  // `servings_unit` columns. The Schema.org forms exist only on SchemaOrgRecipe,
  // at the edges. All four keys still sit in the stored blob of older rows,
  // frozen at backfill time; the repo layer deletes them on read and strips them
  // on write so nothing above it can see them.
  keywords?: string;
  nutrition?: SchemaNutrition;
  datePublished?: string;
  notes?: string;
  cookingNotes?: string;
}

/**
 * The nutrition block as stored: nutrient strings only. `servingSize` is NOT
 * here — it is one unit of what `servings_unit` counts, so it is regenerated at
 * the wire boundaries (`SchemaOrgNutrition`) rather than stored as a second,
 * free-text spelling of the same fact.
 */
export interface SchemaNutrition {
  "@type"?: "NutritionInformation";
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
}

/**
 * The nutrition block as published: the stored nutrients plus the derived
 * `servingSize` ("1 serving", "1 kebab"). Outbound only — an inbound
 * `servingSize` is dropped, since the columns say what a serving is.
 */
export type SchemaOrgNutrition = SchemaNutrition & { servingSize?: string };

export interface RecipesResult {
  data: RecipeRow[];
  count: number;
}
