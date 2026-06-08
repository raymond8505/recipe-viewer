import { z } from "zod";

// Loose zod definition for SchemaRecipe — strict typing is enforced by TypeScript
// at the boundary. We accept anything shaped like Schema.org/Recipe to keep tool
// args flexible for Claude; the database column is jsonb anyway.
const ingredientSchema = z.union([
  z.string(),
  z.object({ name: z.string(), group: z.string().optional() }),
]);

const howToStepSchema = z.object({
  "@type": z.string().optional(),
  text: z.string(),
  name: z.string().optional(),
  timeRequired: z.string().optional(),
});

const howToSectionSchema = z.object({
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
        "@type": z.string().optional(),
        name: z.string(),
      })
      .optional(),
    cookTime: z.string().optional(),
    prepTime: z.string().optional(),
    totalTime: z.string().optional(),
    recipeYield: z.union([z.string(), z.array(z.string())]).optional(),
    recipeCuisine: z.string().optional(),
    recipeCategory: z.union([z.string(), z.array(z.string())]).optional(),
    recipeIngredient: z.array(ingredientSchema).optional(),
    recipeInstructions: z.array(z.union([howToStepSchema, howToSectionSchema])).optional(),
    keywords: z.string().optional(),
    nutrition: z
      .object({
        "@type": z.string().optional(),
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

const statusSchema = z.enum(["published", "archived", "draft"]);

export const searchRecipesArgs = z.object({
  query: z.string().optional(),
  source: z.string().optional(),
  status: statusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  page: z.number().int().min(1).optional(),
});

export const getRecipeArgs = z.object({
  id: z.string().min(1),
});

export const createRecipeArgs = z.object({
  url: z.string().url(),
  source: z.string().min(1),
  status: statusSchema.optional(),
  schema: schemaRecipeSchema,
});

export const updateRecipeArgs = z.object({
  id: z.string().min(1),
  url: z.string().url().optional(),
  source: z.string().min(1).optional(),
  status: statusSchema.optional(),
  schema: schemaRecipeSchema.partial().optional(),
});

export const deleteRecipeArgs = z.object({
  id: z.string().min(1),
});

export type SearchRecipesArgs = z.infer<typeof searchRecipesArgs>;
export type GetRecipeArgs = z.infer<typeof getRecipeArgs>;
export type CreateRecipeArgs = z.infer<typeof createRecipeArgs>;
export type UpdateRecipeArgs = z.infer<typeof updateRecipeArgs>;
export type DeleteRecipeArgs = z.infer<typeof deleteRecipeArgs>;

// Hand-written JSON Schema mirrors for the MCP tools/list response.
// Kept inline (not zod-converted) to avoid an extra dependency.

const schemaRecipeJsonSchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    image: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
    author: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
    cookTime: { type: "string", description: "ISO 8601 duration (e.g. PT30M)" },
    prepTime: { type: "string", description: "ISO 8601 duration" },
    totalTime: { type: "string", description: "ISO 8601 duration" },
    recipeYield: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
    recipeCuisine: { type: "string" },
    recipeCategory: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
    recipeIngredient: {
      type: "array",
      items: {
        oneOf: [
          { type: "string" },
          {
            type: "object",
            required: ["name"],
            properties: { name: { type: "string" }, group: { type: "string" } },
          },
        ],
      },
    },
    recipeInstructions: { type: "array", description: "HowToStep[] or mixed with HowToSection[]" },
    keywords: { type: "string" },
    nutrition: { type: "object" },
    datePublished: { type: "string" },
    notes: { type: "string", description: "App-internal notes (not part of Schema.org/Recipe)" },
    cookingNotes: { type: "string", description: "App-internal cooking notes" },
  },
  additionalProperties: true,
} as const;

const statusEnum = { type: "string", enum: ["published", "archived", "draft"] } as const;

export const TOOL_SCHEMAS = {
  search_recipes: {
    type: "object",
    properties: {
      query: { type: "string", description: "Substring to match against recipe name" },
      source: { type: "string", description: "Filter by source (e.g. domain)" },
      status: statusEnum,
      limit: { type: "integer", minimum: 1, maximum: 100, default: 24 },
      page: { type: "integer", minimum: 1, default: 1 },
    },
  },
  get_recipe: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", description: "Recipe UUID" },
    },
  },
  create_recipe: {
    type: "object",
    required: ["url", "source", "schema"],
    properties: {
      url: { type: "string", format: "uri" },
      source: { type: "string" },
      status: statusEnum,
      schema: schemaRecipeJsonSchema,
    },
  },
  update_recipe: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string" },
      url: { type: "string", format: "uri" },
      source: { type: "string" },
      status: statusEnum,
      schema: {
        ...schemaRecipeJsonSchema,
        required: [],
        description: "Partial SchemaRecipe; merged into existing metadata.schema",
      },
    },
  },
  delete_recipe: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", description: "Recipe UUID — soft-deleted by setting status=archived" },
    },
  },
} as const;
