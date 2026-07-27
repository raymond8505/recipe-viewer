import { TOOL_SCHEMAS } from "./schemas";
import { RECIPE_TOKEN_TTL_LABEL } from "./recipeToken";
import {
  recipeCreateInputSchema,
  recipeIdInputSchema,
  recipeImageUploadInputSchema,
  recipeSearchInputSchema,
  recipeUpdateInputSchema,
} from "@/lib/schemas/recipe";
import {
  ingredientCreateToolInputSchema,
  ingredientIdInputSchema,
  ingredientSearchInputSchema,
  ingredientUpdateToolInputSchema,
} from "@/lib/schemas/ingredient";
import {
  clearCookingNotes,
  createIngredient,
  createRecipe,
  deleteIngredient,
  deleteRecipe,
  getIngredient,
  getRecipe,
  getToken,
  searchIngredients,
  searchRecipes,
  ToolError,
  updateIngredient,
  updateRecipe,
  uploadRecipeImage,
} from "./tools";
import {
  JsonRpcErrorCode,
  JsonRpcMethod,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./types";

// MCP protocol version — the spec uses date-stamped version strings
// (https://modelcontextprotocol.io/specification). Bumping requires
// reviewing the changelog for breaking changes in tools/list and
// tools/call response shapes.
export const PROTOCOL_VERSION = "2024-11-05";
export const SERVER_INFO = { name: "recipe-viewer-mcp", version: "1.0.0" } as const;

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (args: unknown) => Promise<unknown>;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "search_recipes",
    description:
      "Search recipes by name, source, or status. Returns a paginated list with total count; each result is trimmed to { id, url, name, description } — call get_recipe with an id for the full schema. Use this before get_recipe when you only have a name.",
    inputSchema: TOOL_SCHEMAS.search_recipes,
    call: (args) => searchRecipes(recipeSearchInputSchema.parse(args)),
  },
  {
    name: "search_ingredients",
    description:
      "Semantic search over the known-ingredient catalog. Returns up to `limit` ingredients ranked by similarity (1.0 = identical), each with per-100g nutrition (calories_kcal, protein_g, fat_g, saturated_fat_g, carbs_g, fiber_g, sugars_g, sodium_mg, cholesterol_mg, calcium_mg, iron_mg, potassium_mg) and density_g_per_ml. Density converts volume↔weight: grams = ml × density_g_per_ml (e.g. 1 tbsp = 14.79 ml). Data is USDA FoodData Central or manually curated; null fields mean not yet known.",
    inputSchema: TOOL_SCHEMAS.search_ingredients,
    call: (args) => searchIngredients(ingredientSearchInputSchema.parse(args)),
  },
  {
    name: "get_ingredient",
    description:
      "Fetch the full catalog row for an ingredient UUID — includes fields search_ingredients results omit (aliases, fdc_id, fdc_data_type, food_portions, source, timestamps). Get ids from search_ingredients.",
    inputSchema: TOOL_SCHEMAS.get_ingredient,
    call: (args) => getIngredient(ingredientIdInputSchema.parse(args)),
  },
  {
    name: "create_ingredient",
    description:
      "Add an ingredient to the known-ingredient catalog. Names are unique case-insensitively — ALWAYS call search_ingredients first and update the existing row instead of creating a near-duplicate. Pass nutrition together with the portion those values are measured for (e.g. calories per 1 tbsp with portion { gramWeight: 14, amount: 1, modifier: \"tbsp\" }); the server converts deterministically for storage and saves the portion on the ingredient. density_g_per_ml converts volume↔weight (grams = ml × density). The matching embedding is derived server-side from name — you never supply it. source defaults to 'manual'.",
    inputSchema: TOOL_SCHEMAS.create_ingredient,
    call: (args) => createIngredient(ingredientCreateToolInputSchema.parse(args)),
  },
  {
    name: "update_ingredient",
    description:
      "Patch fields on a catalog ingredient — only the fields you pass change. Renaming re-derives the matching embedding server-side. To change nutrition, pass nutrition together with the portion those values are measured for — the stored nutrition is replaced to match (whole object, deterministic conversion; the portion itself is not saved). Fails with 'conflict' if the new name collides with another row (case-insensitive).",
    inputSchema: TOOL_SCHEMAS.update_ingredient,
    call: (args) => updateIngredient(ingredientUpdateToolInputSchema.parse(args)),
  },
  {
    name: "delete_ingredient",
    description:
      "PERMANENTLY delete a catalog ingredient (hard delete — there is no archive state, unlike delete_recipe). Recipe lines that referenced it keep their parsed text/quantities but detach (their ingredient_id nulls out), so those recipes lose ingredient-derived nutrition until re-matched. Prefer update_ingredient to fix a bad row.",
    inputSchema: TOOL_SCHEMAS.delete_ingredient,
    call: (args) => deleteIngredient(ingredientIdInputSchema.parse(args)),
  },
  {
    name: "get_recipe",
    description: "Fetch the full recipe row (including metadata.schema) for a given recipe UUID.",
    inputSchema: TOOL_SCHEMAS.get_recipe,
    call: (args) => getRecipe(recipeIdInputSchema.parse(args)),
  },
  {
    name: "get_token",
    description:
      `Mint a short-lived (${RECIPE_TOKEN_TTL_LABEL}) bearer token scoped to a single recipe UUID. Required to authenticate agent-facing HTTP endpoints such as the multipart image upload (POST /api/recipes/<id>/upload-image) — call this first, then pass the returned token as \`Authorization: Bearer <token>\`. The token only works for the recipe id you pass here. Returns { token, recipeId, expiresInSeconds }.`,
    inputSchema: TOOL_SCHEMAS.get_token,
    call: (args) => getToken(recipeIdInputSchema.parse(args)),
  },
  {
    name: "create_recipe",
    description:
      "Insert a new recipe row. Requires source and a SchemaRecipe object; defaults status to 'draft'. url is OPTIONAL — when omitted it defaults to the recipe's own canonical page on this instance (<base-url>/recipes/<new-uuid>). Set recipeYield as a structured QuantitativeValue — value = serving count, unitText = its label, and valueReference = the recipe's raw weight/volume in metric units (value + unitText; unitText must be one of g/kg/ml/l) when known, since it drives the per-serving nutrition; a plain-string yield is accepted but deprecated. cookingNotes is read-only for agents: if present it is ignored (the call still succeeds) and the response carries a 'warnings' note explaining why.",
    inputSchema: TOOL_SCHEMAS.create_recipe,
    call: (args) => createRecipe(recipeCreateInputSchema.parse(args)),
  },
  {
    name: "update_recipe",
    description:
      "Patch fields on an existing recipe. The schema field is merged into existing metadata.schema (not replaced). Prefer a structured QuantitativeValue for recipeYield (value = serving count, unitText = its label, valueReference = raw weight/volume in metric units g/kg/ml/l for per-serving nutrition); plain-string yields are accepted but deprecated. cookingNotes is read-only for agents: if present it is ignored (the call still succeeds) and the response carries a 'warnings' note. Use clear_cooking_notes to clear it.",
    inputSchema: TOOL_SCHEMAS.update_recipe,
    call: (args) => updateRecipe(recipeUpdateInputSchema.parse(args)),
  },
  {
    name: "clear_cooking_notes",
    description:
      "Clear a recipe's cooking notes (sets cookingNotes to empty). This is the ONLY agent-writable path for cookingNotes — use it only when the user explicitly asks to clear the notes, e.g. after you've applied them.",
    inputSchema: TOOL_SCHEMAS.clear_cooking_notes,
    call: (args) => clearCookingNotes(recipeIdInputSchema.parse(args)),
  },
  {
    name: "delete_recipe",
    description: "Soft-delete a recipe by setting its status to 'archived'. Reversible via update_recipe.",
    inputSchema: TOOL_SCHEMAS.delete_recipe,
    call: (args) => deleteRecipe(recipeIdInputSchema.parse(args)),
  },
  {
    name: "upload_recipe_image",
    description:
      `Set a recipe's image (Supabase Storage + schema.image). Two ways to provide the image: (1) imageUrl when it is reachable at a public http(s) URL — pass it as the imageUrl argument and the server fetches, validates, and uploads it (do NOT fetch it yourself or base64-encode a URL); (2) a local file when you have shell access — this tool does NOT take file bytes; instead first call the get_token tool with this recipe's id to obtain a short-lived (${RECIPE_TOKEN_TTL_LABEL}) upload token, then: curl -H \"Authorization: Bearer <token-from-get_token>\" -F \"file=@<path>\" <origin>/api/recipes/<id>/upload-image (same origin as this MCP server; the route returns 401 without a valid token; it sets schema.image by default — add -F \"updateSchema=false\" only to upload the bytes without repointing the recipe) — the <origin> domain may need to be in your shell/network allowlist for the curl to reach it. Accepts PNG, JPEG, or WebP.`,
    inputSchema: TOOL_SCHEMAS.upload_recipe_image,
    call: (args) => uploadRecipeImage(recipeImageUploadInputSchema.parse(args)),
  },
];

const toolByName = new Map(TOOLS.map((t) => [t.name, t]));

export async function handleJsonRpc(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  // Notifications (no id) get no response per JSON-RPC 2.0.
  if (req.id == null) return null;
  const id = req.id;

  if (req.method === JsonRpcMethod.INITIALIZE) {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    };
  }

  if (req.method === JsonRpcMethod.TOOLS_LIST) {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      },
    };
  }

  if (req.method === JsonRpcMethod.TOOLS_CALL) {
    const params = (req.params ?? {}) as { name?: string; arguments?: unknown };
    const tool = params.name ? toolByName.get(params.name) : undefined;
    if (!tool) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: JsonRpcErrorCode.INVALID_PARAMS,
          message: `Unknown tool: ${params.name}`,
        },
      };
    }

    try {
      const result = await tool.call(params.arguments ?? {});
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result) }],
        },
      };
    } catch (err) {
      if (err instanceof ToolError) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [{ type: "text", text: `${err.code}: ${err.message}` }],
          },
        };
      }
      const message = err instanceof Error ? err.message : "Tool execution failed";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [{ type: "text", text: message }],
        },
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: JsonRpcErrorCode.METHOD_NOT_FOUND,
      message: `Method not found: ${req.method}`,
    },
  };
}
