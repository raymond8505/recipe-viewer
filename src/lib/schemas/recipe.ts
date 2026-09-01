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

export const ingredientSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    group: z.string().optional(),
    // Stable line identity (see RecipeIngredient.id). Accepted so a client
    // that read a recipe can hand its lines back unchanged and keep each
    // line's derived row; the write path mints one when it's absent.
    id: z.string().optional(),
  }),
]);

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
    cookTime: z.string().optional(),
    prepTime: z.string().optional(),
    totalTime: z.string().optional(),
    recipeYield: z
      .union([z.string(), z.array(z.string()), quantitativeValueSchema])
      .optional(),
    recipeCuisine: z.string().optional(),
    recipeCategory: z.union([z.string(), z.array(z.string())]).optional(),
    recipeIngredient: z.array(ingredientSchema).optional(),
    recipeInstructions: z.array(z.union([howToStepSchema, howToSectionSchema])).optional(),
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

// Recipe row `status` column — used as a zod enum at boundaries (MCP tool
// args, future form handlers) and as the source of valid values in the
// JSON-Schema export for MCP tool descriptors.
export const recipeStatusSchema = z.enum(["published", "archived", "draft"]);
export const RECIPE_STATUSES = recipeStatusSchema.options;

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
    schema: schemaRecipeSchema,
  })
  .refine(sourceRequiredWithUrl, SOURCE_REQUIRED_WITH_URL_ISSUE);

export const recipeUpdateInputSchema = z.object({
  id: z.string().min(1),
  url: z.string().url().optional(),
  source: z.string().min(1).optional(),
  status: recipeStatusSchema.optional(),
  schema: schemaRecipeSchema.partial().optional(),
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
