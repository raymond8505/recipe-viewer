// MCP-specific schemas: a hand-written JSON Schema mirror of the recipe input
// validators, used in the `tools/list` response so MCP clients can do client-
// side argument validation.
//
// The actual zod validators (recipeSearchInputSchema, recipeCreateInputSchema,
// etc.) live in `@/lib/schemas/recipe` so they're reusable by non-MCP callers
// (API route handlers, form validators). The JSON Schema map below is the
// only thing here that is genuinely MCP-protocol-specific — it describes the
// wire format that MCP `tools/list` emits.

import { RECIPE_STATUSES } from "@/lib/schemas/recipe";

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
    cookingNotes: {
      type: "string",
      description:
        "App-internal cooking notes — READ-ONLY for agents. Ignored by create_recipe/update_recipe (the call still succeeds with a warning). Authored by users in cooking mode; clear it via the clear_cooking_notes tool.",
    },
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
  get_token: {
    type: "object",
    required: ["id"],
    properties: {
      id: {
        type: "string",
        description: "Recipe UUID the token will be scoped to",
      },
    },
  },
  create_recipe: {
    type: "object",
    required: ["source", "schema"],
    properties: {
      url: {
        type: "string",
        format: "uri",
        description:
          "Optional. Defaults to the recipe's own canonical page on this instance (<base-url>/recipes/<new-uuid>) when omitted.",
      },
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
  clear_cooking_notes: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", description: "Recipe UUID whose cookingNotes will be cleared" },
    },
  },
  delete_recipe: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", description: "Recipe UUID — soft-deleted by setting status=archived" },
    },
  },
  upload_recipe_image: {
    type: "object",
    required: ["id", "imageUrl"],
    properties: {
      id: { type: "string", description: "Recipe UUID" },
      imageUrl: {
        type: "string",
        format: "uri",
        description:
          "Public http(s) URL to fetch the image from. The server downloads, validates, and uploads it. Use this whenever the user gives you an image URL — do not fetch it yourself. For a local file, use the multipart upload endpoint described in the tool description instead.",
      },
    },
  },
} as const;
