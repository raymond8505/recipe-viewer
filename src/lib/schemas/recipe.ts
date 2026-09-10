// Centralized zod validators for the recipe domain. Anything that needs to
// validate a SchemaRecipe shape at runtime should import from here, so the
// MCP tools, future API routes, and form handlers all agree on the contract.
//
// The TypeScript type for `SchemaRecipe` still lives in `src/types/recipe.ts`
// — the two are kept aligned by hand. If the type grows, mirror the change
// here.

import { z } from "zod";
import { CUSTOM_RECIPE_SOURCE } from "@/lib/format";
import { METRIC_YIELD_UNITS } from "@/lib/units";
import type { Assert, Assignable } from "@/lib/exhaustive";
import type { RecipeInstructionGroup, RecipeRowColumns } from "@/types/recipe";

// A Schema.org `recipeIngredient` entry as it arrives from outside (a scrape,
// create_recipe): a bare string, or an object carrying this app's `group`
// extension. Inbound only — see SchemaOrgIngredientLine.
export const schemaOrgIngredientLineSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    group: z.string().optional(),
  }),
]);

// What a writer sends for a recipe's ingredients: groups of lines, each line
// naming the row it already is (`id`) or arriving as text alone (a new row).
export const recipeIngredientLineInputSchema = z.object({
  id: z.string().min(1).optional(),
  raw_text: z.string().trim().min(1).max(500),
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

// valueReference — the recipe's raw weight/volume; metric units only.
const metricQuantitativeValue = z.object({
  ...quantitativeValueBase,
  unitText: z.enum(METRIC_YIELD_UNITS).optional(),
});

export const quantitativeValueSchema = z.object({
  ...quantitativeValueBase,
  unitText: z.string().optional(), // serving label: free text ("kebabs")
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

// A section as scrapers send it: `itemListElement` is usually an array,
// sometimes a lone step, occasionally missing. See SchemaOrgHowToSection.
const schemaOrgHowToSectionSchema = howToSectionSchema.extend({
  itemListElement: z.union([z.array(howToStepSchema), howToStepSchema]).optional(),
});

const schemaOrgInstructionItemSchema = z.union([
  z.string(),
  howToStepSchema,
  schemaOrgHowToSectionSchema,
]);

// The inbound Schema.org edge for instructions: the array, one item, or the
// markdown string some scrapers produce. See SchemaOrgInstructions.
export const schemaOrgInstructionsInputSchema = z.union([
  z.string(),
  howToStepSchema,
  schemaOrgHowToSectionSchema,
  z.array(schemaOrgInstructionItemSchema),
]);

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
// the other lacks. In source, not a test — tsconfig excludes src/__tests__.
export type _InstructionsInputMatchesGroups = Assert<
  Assignable<z.infer<typeof recipeInstructionsInputSchema>, RecipeInstructionGroup[]>
>;
export type _InstructionGroupsMatchInput = Assert<
  Assignable<RecipeInstructionGroup[], z.infer<typeof recipeInstructionsInputSchema>>
>;

export const schemaRecipeSchema = z
  .object({
    "@context": z.string().optional(),
    "@type": z.literal("Recipe").optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    image: z.union([z.string(), z.array(z.string())]).optional(),
    author: z
      .object({
        "@type": z.literal("Person").optional(),
        name: z.string(),
      })
      .optional(),
    // Nullable so a partial update can clear a time outright; omitted still
    // means "leave it alone". See RecipeRow's time columns.
    cookTime: z.string().nullable().optional(),
    prepTime: z.string().nullable().optional(),
    totalTime: z.string().nullable().optional(),
    recipeYield: z
      .union([z.string(), z.array(z.string()), quantitativeValueSchema])
      .optional(),
    recipeCuisine: z.string().optional(),
    recipeCategory: z.union([z.string(), z.array(z.string())]).optional(),
    keywords: z.string().optional(),
    nutrition: z
      .object({
        "@type": z.literal("NutritionInformation").optional(),
        servingSize: z.string().optional(),
        calories: z.string().optional(),
        proteinContent: z.string().optional(),
        carbohydrateContent: z.string().optional(),
        fatContent: z.string().optional(),
        fiberContent: z.string().optional(),
        sodiumContent: z.string().optional(),
        sugarContent: z.string().optional(),
        saturatedFatContent: z.string().optional(),
        unsaturatedFatContent: z.string().optional(),
        cholesterolContent: z.string().optional(),
      })
      .optional(),
    datePublished: z.string().optional(),
    notes: z.string().optional(),
    cookingNotes: z.string().optional(),
  })
  .passthrough();

// The inbound Schema.org edge: the stored recipe plus `recipeIngredient` and
// `recipeInstructions`, for writers that speak Schema.org because their source
// does (a scrape landing through create_recipe or the re-scrape webhook).
// `fromSchemaOrgIngredients` / `fromSchemaOrgInstructions` turn them into
// groups at the boundary; the stored schema never carries either.
export const schemaOrgRecipeInputSchema = schemaRecipeSchema.extend({
  recipeIngredient: z.array(schemaOrgIngredientLineSchema).optional(),
  recipeInstructions: schemaOrgInstructionsInputSchema.optional(),
});

// Recipe row `status` column — used as a zod enum at boundaries (MCP tool
// args, future form handlers) and as the source of valid values in the
// JSON-Schema export for MCP tool descriptors.
export const recipeStatusSchema = z.enum(["published", "archived", "draft"]);
export const RECIPE_STATUSES = recipeStatusSchema.options;

// Derived from the zod enum rather than restated, so the column's valid values
// live in exactly one place. It lives HERE, beside the enum, rather than in the
// repo module that reads the column: `@/lib/recipes` reaches `@/env` through
// Supabase and the embedding client, so a client module that wants this type
// would have to name a server module to get it. This file imports only zod,
// format and units, so client and server can both just import it.
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

// RecipeRowColumns hand-mirrors this union so `@/types` can stay free of any
// runtime dependency. This pins the two together: drop or add a status on
// either side and the alias stops compiling. It lives in source, not a test —
// tsconfig excludes src/__tests__, so an assertion written there checks nothing.
export type _RecipeStatusMatchesRow = Assert<
  Assignable<RecipeStatus | null, RecipeRowColumns["status"]>
>;
export type _RowStatusMatchesRecipeStatus = Assert<
  Assignable<RecipeRowColumns["status"], RecipeStatus | null>
>;

// The two statuses the app applies on its own — named so the repo writes, the
// JSON-Schema export and the MCP tool prose that documents them all move
// together when a status is renamed.
export const DEFAULT_RECIPE_STATUS = recipeStatusSchema.enum.draft;
export const PUBLISHED_RECIPE_STATUS = recipeStatusSchema.enum.published;
export const ARCHIVED_RECIPE_STATUS = recipeStatusSchema.enum.archived;

// Input shapes for the recipe CRUD operations. Defined here (not in
// `lib/mcp/schemas.ts`) so non-MCP callers — API route handlers, form
// validators, future migrations — can reuse the same validators rather than
// hand-rolling parallel ones. The MCP server consumes these via parse() at
// the tool boundary; nothing else has to know they exist on that path.

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

export const recipeCreateInputSchema = z
  .object({
    // Optional — when omitted, the create tool defaults it to the recipe's own
    // canonical URL on this instance (env.MCP_PUBLIC_URL + /recipes/<new-uuid>).
    url: z.string().url().optional(),
    // Optional only in that same case — see sourceRequiredWithUrl above.
    source: z.string().min(1).optional(),
    status: recipeStatusSchema.optional(),
    schema: schemaOrgRecipeInputSchema,
  })
  .refine(sourceRequiredWithUrl, SOURCE_REQUIRED_WITH_URL_ISSUE);

// Update speaks the app's own shape: `ingredients` replaces the whole list
// (lines keep their rows by id), `instructions` replaces the whole step list,
// and `schema` is the stored recipe — it has neither recipeIngredient nor
// recipeInstructions, and the tool rejects either rather than silently
// ignoring it.
export const recipeUpdateInputSchema = z.object({
  id: z.string().min(1),
  url: z.string().url().optional(),
  source: z.string().min(1).optional(),
  status: recipeStatusSchema.optional(),
  schema: schemaRecipeSchema.partial().optional(),
  ingredients: recipeIngredientsInputSchema.optional(),
  instructions: recipeInstructionsInputSchema.optional(),
});

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
export type RecipeCreateInput = z.infer<typeof recipeCreateInputSchema>;
export type RecipeUpdateInput = z.infer<typeof recipeUpdateInputSchema>;
export type RecipeImageUploadInput = z.infer<typeof recipeImageUploadInputSchema>;
