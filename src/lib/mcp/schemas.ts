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
  upload_recipe_image: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", description: "Recipe UUID" },
      imageUrl: {
        type: "string",
        format: "uri",
        description:
          "Public http(s) URL to fetch the image from. The server downloads, validates, and uploads it. Use this whenever the user gives you an image URL — do not fetch it yourself or base64-encode it.",
      },
      imageBase64: {
        type: "string",
        description:
          "Base64-encoded image bytes with no data: prefix. LAST RESORT for small images only (max ~1MB decoded): base64 in tool arguments is emitted as model output tokens, so large images take minutes to send and bloat the conversation. If you have a local file and shell access, POST it as multipart instead (see tool description). Do NOT base64-encode a URL — pass it as imageUrl. Requires contentType.",
      },
      contentType: {
        type: "string",
        enum: ["image/png", "image/jpeg", "image/webp"],
        description:
          "Required with imageBase64. Ignored with imageUrl (derived from the server-side response).",
      },
    },
    description:
      "Set a recipe's image. Prefer, in order: (1) imageUrl when the image is reachable at a URL — the server fetches it; (2) if you have a local file and shell access, do NOT base64 it through this tool — POST the raw bytes to this server's HTTP endpoint instead. First call the get_token tool with this recipe's id to obtain a short-lived (5-minute) upload token, then pass it as the bearer header: curl -H \"Authorization: Bearer <token-from-get_token>\" -F \"file=@<path>\" <origin>/api/recipes/<id>/upload-image (same origin as this MCP server; the route returns 401 without a valid token; updates schema.image by default and returns the storage URL — add -F \"updateSchema=false\" to upload the bytes without repointing the recipe) — the <origin> domain may need to be in your shell/network allowlist for the curl to reach it; (3) imageBase64 + contentType only as a last resort for small images.",
  },
} as const;
