// The recipe domain's zod validators, in one place so the MCP tools, the API
// routes and the repo layer all parse against the same contract.

import { z } from "zod";
import { CUSTOM_RECIPE_SOURCE } from "@/lib/format";
import { METRIC_YIELD_UNITS } from "@/lib/units";
import type { Assert, Assignable } from "@/lib/exhaustive";
import type {
  RecipeInstructionGroup,
  RecipeRowColumns,
  SchemaRecipe,
} from "@/types/recipe";

// A Schema.org `recipeIngredient` entry as it arrives from outside (a scrape,
// create_recipe_detailed): a bare string, or an object carrying this app's `group`
// extension. Inbound only — see SchemaOrgIngredientLine.
export const schemaOrgIngredientLineSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    group: z.string().optional(),
  }),
]);

/**
 * The cap on one ingredient line's text, at every edge that accepts a line.
 * `recipe_ingredients.raw_text` is unbounded `text`, so this is a sanity bound
 * on what a writer may send rather than a storage limit.
 */
export const INGREDIENT_LINE_MAX_LENGTH = 500;

// What a writer sends for a recipe's ingredients: groups of lines, each line
// naming the row it already is (`id`) or arriving as text alone (a new row).
export const recipeIngredientLineInputSchema = z.object({
  id: z.string().min(1).optional(),
  raw_text: z.string().trim().min(1).max(INGREDIENT_LINE_MAX_LENGTH),
});

export const recipeIngredientGroupInputSchema = z.object({
  name: z.string().trim().min(1).optional(),
  ingredients: z.array(recipeIngredientLineInputSchema),
});

export const recipeIngredientsInputSchema = z.array(recipeIngredientGroupInputSchema);

// Schema.org/QuantitativeValue — the structured form of recipeYield. Top level:
// value = serving count, unitText = its (free-text) label e.g. "kebabs".
// valueReference nests the raw weight/volume (value + unitText) — its unitText
// is restricted to METRIC units only, since it's the nutrition per-serving basis
// and is rendered verbatim. One nesting level is enough for our use; a deeper
// valueReference.valueReference is simply stripped.
const quantitativeValueBase = {
  "@type": z.literal("QuantitativeValue").optional(),
  value: z.number().optional(),
};

const metricQuantitativeValue = z.object({
  ...quantitativeValueBase,
  unitText: z.enum(METRIC_YIELD_UNITS).optional(),
});

export const quantitativeValueSchema = z.object({
  ...quantitativeValueBase,
  unitText: z.string().optional(),
  valueReference: metricQuantitativeValue.optional(),
});

export const howToStepSchema = z.object({
  "@type": z.string().optional(),
  text: z.string(),
  name: z.string().optional(),
  timeRequired: z.string().optional(),
});

export const howToSectionSchema = z.object({
  "@type": z.literal("HowToSection"),
  name: z.string(),
  itemListElement: z.array(howToStepSchema),
});

// What a writer sends for a recipe's instructions: the stored shape itself,
// since a step has no identity to preserve. `seconds` is a timer's whole-second
// duration and needs the timer's label — the same rule the editor enforces.
export const recipeStepInputSchema = z
  .object({
    text: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    seconds: z.number().int().min(1).optional(),
  })
  .refine((step) => step.seconds === undefined || step.name !== undefined, {
    message: "seconds needs a name — the timer's label",
    path: ["seconds"],
  });

export const recipeInstructionGroupInputSchema = z.object({
  name: z.string().trim().min(1).optional(),
  steps: z.array(recipeStepInputSchema),
});

export const recipeInstructionsInputSchema = z.array(recipeInstructionGroupInputSchema);

// The input IS the stored type; pinned both ways so neither can grow a field
// the other lacks.
export type _InstructionsInputMatchesGroups = Assert<
  Assignable<z.infer<typeof recipeInstructionsInputSchema>, RecipeInstructionGroup[]>
>;
export type _InstructionGroupsMatchInput = Assert<
  Assignable<RecipeInstructionGroup[], z.infer<typeof recipeInstructionsInputSchema>>
>;

// The STORED blob, and nothing more — the validator counterpart of
// `SchemaRecipe`. Everything a recipe is made of has a column; what is left is
// the two fields awaiting the tagging system and the wire form's two constants.
//
// Declared strict and passed through below: `keyof` on a passthrough shape is
// `string`, which would leave the pin beneath it asserting nothing. It IS
// passthrough at the boundary, because a sender can still put a promoted or
// dropped key on the wire — the repo layer strips every one from the write.
const schemaRecipeFields = z.object({
  "@context": z.string().optional(),
  "@type": z.literal("Recipe").optional(),
  // Nullable so a partial update can clear a time outright; omitted still
  // means "leave it alone". See RecipeRow's time columns.
  cookTime: z.string().nullable().optional(),
  prepTime: z.string().nullable().optional(),
  totalTime: z.string().nullable().optional(),
  recipeCuisine: z.string().optional(),
  recipeCategory: z.union([z.string(), z.array(z.string())]).optional(),
});

export const schemaRecipeSchema = schemaRecipeFields.passthrough();

// `SchemaRecipe` (@/types/recipe) hand-mirrors the shape above so `@/types`
// carries no runtime dependency. These pin the two key sets together: a field
// one side gains and the other lacks stops the alias compiling.
export type _SchemaKeysCoverSchemaRecipe = Assert<
  Assignable<keyof z.infer<typeof schemaRecipeFields>, keyof SchemaRecipe>
>;
export type _SchemaRecipeKeysCoverSchema = Assert<
  Assignable<keyof SchemaRecipe, keyof z.infer<typeof schemaRecipeFields>>
>;

// The inbound Schema.org edge: the stored blob plus every column-backed field
// in its wire spelling, for writers that speak Schema.org because their source
// does (a scrape landing through create_recipe_detailed or the re-scrape
// webhook). Each is reduced to its column exactly once, here — `getFirstImage`
// for the image, `parseYield` for the yield, `fromSchemaOrgIngredients` /
// `fromSchemaOrgInstructions` for the lines and steps — and stripped from the
// blob that is stored.
export const schemaOrgRecipeInputSchema = schemaRecipeSchema.extend({
  name: z.string().min(1),
  description: z.string().optional(),
  image: z.union([z.string(), z.array(z.string())]).optional(),
  notes: z.string().optional(),
  recipeIngredient: z.array(schemaOrgIngredientLineSchema).optional(),
  recipeInstructions: z.array(z.union([howToStepSchema, howToSectionSchema])).optional(),
  recipeYield: z
    .union([z.string(), z.array(z.string()), quantitativeValueSchema])
    .optional(),
});

/**
 * The servings columns as a writer sets them. Three-way, like the times: the
 * key absent leaves both alone, `amount: null` clears the count, a number sets
 * it; `unit` absent leaves the unit alone and null clears it. Grouped rather
 * than two loose scalars so a caller cannot pass them in the wrong order.
 */
export const servingsInputSchema = z.object({
  amount: z.number().positive().nullable(),
  unit: z.string().min(1).nullable().optional(),
});

/** The whole recipe's raw weight, metric only — same three-way semantics. */
export const totalWeightInputSchema = z.object({
  amount: z.number().positive().nullable(),
  unit: z.enum(METRIC_YIELD_UNITS).nullable().optional(),
});

// The `status` column, as the enum every boundary validates against and the
// source of the values the MCP JSON-Schema export lists.
export const recipeStatusSchema = z.enum(["published", "archived", "draft"]);
export const RECIPE_STATUSES = recipeStatusSchema.options;

// Derived from the zod enum rather than restated, so the column's valid values
// live in exactly one place.
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

// RecipeRowColumns hand-mirrors this union so `@/types` can stay free of any
// runtime dependency. This pins the two together: drop or add a status on
// either side and the alias stops compiling.
export type _RecipeStatusMatchesRow = Assert<
  Assignable<RecipeStatus | null, RecipeRowColumns["status"]>
>;
export type _RowStatusMatchesRecipeStatus = Assert<
  Assignable<RecipeRowColumns["status"], RecipeStatus | null>
>;

// The statuses the app applies on its own, named so a rename reaches the repo
// writes, the JSON-Schema export and the MCP prose that documents them.
export const DEFAULT_RECIPE_STATUS = recipeStatusSchema.enum.draft;
export const PUBLISHED_RECIPE_STATUS = recipeStatusSchema.enum.published;
export const ARCHIVED_RECIPE_STATUS = recipeStatusSchema.enum.archived;

export const recipeSearchInputSchema = z.object({
  query: z.string().optional(),
  source: z.string().optional(),
  status: recipeStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  page: z.number().int().min(1).optional(),
});

export const recipeIdInputSchema = z.object({
  id: z.string().min(1),
});

// `url` and `source` travel together: omitting `url` means the recipe is
// authored on this instance, so the create tool supplies both defaults (its own
// canonical URL, and CUSTOM_RECIPE_SOURCE). A recipe that DOES carry an external
// url must still declare its provenance — defaulting that to "custom" would
// label someone else's page as one of the user's own recipes, which is exactly
// the distinction the Re-scrape control reads.
const sourceRequiredWithUrl = (d: { url?: unknown; source?: unknown }) =>
  d.url === undefined || d.source !== undefined;
const SOURCE_REQUIRED_WITH_URL_ISSUE = {
  message: `Pass source (the origin domain, e.g. "seriouseats.com") alongside url. Omit both to create a recipe that lives on this instance — source then defaults to "${CUSTOM_RECIPE_SOURCE}".`,
  path: ["source"],
};

export const recipeCreateDetailedInputSchema = z
  .object({
    // Both optional only for a recipe authored here — see
    // sourceRequiredWithUrl above.
    url: z.string().url().optional(),
    source: z.string().min(1).optional(),
    status: recipeStatusSchema.optional(),
    schema: schemaOrgRecipeInputSchema,
  })
  .refine(sourceRequiredWithUrl, SOURCE_REQUIRED_WITH_URL_ISSUE);

const authorNameSchema = z
  .union([z.string().trim().min(1), z.object({ name: z.string().trim().min(1) })])
  .transform((author) => (typeof author === "string" ? author : author.name));

// One ingredient line: the plain string a flat JSON-LD list gives you, or the
// object form a page uses to put the line under a named group. Stricter about
// blanks than `schemaOrgIngredientLineSchema`, which create_recipe_detailed
// shares: here a blank entry fails the call, because dropping it would leave a
// short list that reads as the recipe's own, with nothing to show a line went
// missing.
const ingredientLineTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(INGREDIENT_LINE_MAX_LENGTH);

const simpleIngredientLineSchema = z.union([
  ingredientLineTextSchema,
  // `group` is not held to that: fromSchemaOrgIngredients reads a blank one as
  // "ungrouped", so rejecting the whole paste over an empty heading would throw
  // the lines away to protect a heading nobody needs.
  z.object({ name: ingredientLineTextSchema, group: z.string().optional() }),
]);

/** A HowToStep held to the same no-blanks rule as a line. */
const nonBlankHowToStepSchema = howToStepSchema.extend({
  text: z.string().trim().min(1),
});

// One step, in all three spellings a page offers: a bare string, a HowToStep, or
// a HowToSection carrying its own run. The bare string is wrapped as a
// `{ text }` HowToStep here rather than at the parse site, so
// `fromSchemaOrgInstructions` sees one shape — and that wrap is what makes a
// flat list of strings exactly one nameless group.
const simpleStepSchema = z.union([
  z
    .string()
    .trim()
    .min(1)
    .transform((text) => ({ text })),
  nonBlankHowToStepSchema,
  howToSectionSchema.extend({ itemListElement: z.array(nonBlankHowToStepSchema) }),
]);

// A fresh object rather than an extension of schemaOrgRecipeInputSchema, and
// deliberately not `.passthrough()`: listing only the fields the app reads keeps
// the rest of a scraped blob — image, nutrition, aggregateRating, video — out of
// storage. `recipeYield` is the one shape it narrows (flat, no
// QuantitativeValue), and the author the one it widens.
export const recipeCreateSimpleInputSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  // Every spelling a page uses reduces to the one name the app stores; a list
  // takes the first, since there is nowhere to put a second.
  author: z
    .union([authorNameSchema, z.array(authorNameSchema).nonempty()])
    .transform((author) => ({
      "@type": "Person" as const,
      name: Array.isArray(author) ? author[0] : author,
    }))
    .optional(),
  prepTime: z.string().optional(),
  cookTime: z.string().optional(),
  totalTime: z.string().optional(),
  recipeCuisine: z.string().optional(),
  recipeCategory: z.union([z.string(), z.array(z.string())]).optional(),
  keywords: z.string().optional(),
  datePublished: z.string().optional(),
  // A bare number is legal JSON-LD ("recipeYield": 4) and `parseYield` reads the
  // string form, so the coercion belongs here rather than at the parse site.
  recipeYield: z.union([z.string(), z.number()]).transform(String).optional(),
  recipeIngredient: z.array(simpleIngredientLineSchema).optional(),
  recipeInstructions: z.array(simpleStepSchema).optional(),
  // Absent is what "authored on this instance" means. `source` follows from it
  // — see recipeSourceForUrl — so there is no second field to keep consistent.
  url: z.string().url().optional(),
});

// Update speaks the app's own shape: `ingredients` and `instructions` each
// replace the whole list, `servings` / `total_weight` set the columns, and
// `schema` is the stored recipe. `parseRecipeUpdateArgs` rejects the three
// Schema.org keys that shape lacks rather than letting them through unused.
export const recipeUpdateInputSchema = z.object({
  id: z.string().min(1),
  // The stored column: the page /rescrape re-fetches.
  sourceUrl: z.string().url().optional(),
  source: z.string().min(1).optional(),
  status: recipeStatusSchema.optional(),
  // The column-backed scalars, top level beside `servings` / `total_weight`
  // rather than inside `schema`: `schema` is the stored blob, and none of these
  // is in it. Nullable where clearing is a state a recipe can be in — a recipe
  // always has a name, so that one is not.
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  schema: schemaRecipeSchema.partial().optional(),
  ingredients: recipeIngredientsInputSchema.optional(),
  instructions: recipeInstructionsInputSchema.optional(),
  servings: servingsInputSchema.optional(),
  total_weight: totalWeightInputSchema.optional(),
});

// RecipeRowColumns hand-mirrors the servings columns for the same reason it
// mirrors `status`: @/types stays free of any runtime dependency. These pin the
// two together.
export type _ServingsInputMatchesRow = Assert<
  Assignable<
    z.infer<typeof servingsInputSchema>["amount"],
    RecipeRowColumns["servings_amount"]
  >
>;
export type _RowServingsMatchesInput = Assert<
  Assignable<
    RecipeRowColumns["servings_amount"],
    z.infer<typeof servingsInputSchema>["amount"]
  >
>;

// The MCP tool only fetches images from a URL. Local files go through the
// multipart endpoint (POST /api/recipes/{id}/upload-image) instead — base64 in
// tool arguments is generated by the model as output tokens and is not worth
// supporting.
export const recipeImageUploadInputSchema = z.object({
  id: z.string().min(1),
  imageUrl: z.string().url(),
});

export type RecipeSearchInput = z.infer<typeof recipeSearchInputSchema>;
export type RecipeIdInput = z.infer<typeof recipeIdInputSchema>;
export type RecipeCreateDetailedInput = z.infer<typeof recipeCreateDetailedInputSchema>;
export type RecipeCreateSimpleInput = z.infer<
  typeof recipeCreateSimpleInputSchema
>;
export type RecipeUpdateInput = z.infer<typeof recipeUpdateInputSchema>;
export type RecipeImageUploadInput = z.infer<typeof recipeImageUploadInputSchema>;
