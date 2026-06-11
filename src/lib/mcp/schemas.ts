// MCP-specific schemas: argument validators for the five CRUD tools, plus a
// hand-written JSON Schema mirror used in the `tools/list` response.
//
// The recipe domain schema (`schemaRecipeSchema`) lives in `@/lib/schemas/recipe`
// so non-MCP callers can reuse it. Tool-arg shapes stay here because they are
// only meaningful to the MCP server.

import { z } from "zod";
import {
  recipeStatusSchema,
  RECIPE_STATUSES,
  schemaRecipeSchema,
} from "@/lib/schemas/recipe";

export { schemaRecipeSchema, recipeStatusSchema } from "@/lib/schemas/recipe";

export const searchRecipesArgs = z.object({
  query: z.string().optional(),
  source: z.string().optional(),
  status: recipeStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  page: z.number().int().min(1).optional(),
});

export const getRecipeArgs = z.object({
  id: z.string().min(1),
});

export const createRecipeArgs = z.object({
  url: z.string().url(),
  source: z.string().min(1),
  status: recipeStatusSchema.optional(),
  schema: schemaRecipeSchema,
});

export const updateRecipeArgs = z.object({
  id: z.string().min(1),
  url: z.string().url().optional(),
  source: z.string().min(1).optional(),
  status: recipeStatusSchema.optional(),
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

const statusEnum = { type: "string", enum: RECIPE_STATUSES } as const;

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
