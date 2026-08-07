import { ZodError } from "zod";
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
      "Hybrid keyword + semantic search over the known-ingredient catalog — the FIRST call to make before creating or updating any ingredient. Returns up to `limit` rows, each with per-100g nutrition (calories_kcal, protein_g, fat_g, saturated_fat_g, carbs_g, fiber_g, sugars_g, sodium_mg, cholesterol_mg, calcium_mg, iron_mg, potassium_mg) and density_g_per_ml. Density converts volume↔weight: grams = ml × density_g_per_ml (e.g. 1 tbsp = 14.79 ml). Data is USDA FoodData Central or manually curated; null fields mean not yet known.\n\nJUDGING RESULTS — each row carries THREE numbers, and picking the wrong one is the common failure:\n• semantic_similarity (0–1) — meaning-based, the closest thing to a match signal: higher is a better match, and the top result is usually the right food. There is no calibrated cutoff, so treat it as a ranking aid and DECIDE BY READING THE NAME, not by a threshold.\n• keyword_similarity (0–1) — spelling overlap against the name and every alias. ~1.0 means a near-exact name/alias hit, which is strong evidence. Low is NOT disqualifying: the catalog names foods the way USDA does (\"Butter, without salt\") and recipes don't.\n• score — RANKING ONLY. It is a reciprocal-rank fusion of the two, so it is a tiny number by construction: a PERFECT match scores about 0.04, never near 1.0. Use it to order results and for nothing else.\n\nWHEN UNSURE, PREFER THE EXISTING ROW. The two mistakes are not equal: adding an alias to the wrong row is cheap and reversible, while creating a row for a food already in the catalog splits its nutrition across duplicates and is invisible until someone notices. Judge on whether the name denotes the same food (\"Butter, without salt\" IS unsalted butter; \"Butter oil, anhydrous\" is not) and do not let a low number alone talk you out of a match.\n\nResults omit aliases; call get_ingredient to see them before editing a row.",
    inputSchema: TOOL_SCHEMAS.search_ingredients,
    call: (args) => searchIngredients(ingredientSearchInputSchema.parse(args)),
  },
  {
    name: "get_ingredient",
    description:
      "Fetch the full catalog row for an ingredient UUID — includes fields search_ingredients results omit (aliases, fdc_id, fdc_data_type, food_portions, source, timestamps). Get ids from search_ingredients. Call this before any update_ingredient that touches aliases: that field replaces the whole array, so you need the current one to add to it without dropping the rest.",
    inputSchema: TOOL_SCHEMAS.get_ingredient,
    call: (args) => getIngredient(ingredientIdInputSchema.parse(args)),
  },
  {
    name: "create_ingredient",
    description:
      "Add a NEW ingredient to the known-ingredient catalog — the last resort, not the first move. Both name (case-insensitively) and fdc_id are unique.\n\nBEFORE CALLING THIS, call search_ingredients. The catalog names foods the way USDA does, so the row you want usually already exists under wording you would not have guessed — \"Butter, without salt\" is the row for \"unsalted butter\". If a result is the same food (see search_ingredients on judging semantic_similarity), that IS your ingredient: do NOT create a second row. Instead call get_ingredient for its aliases, then update_ingredient adding your recipe's wording to them. Teaching an existing row a new alias is the normal, expected outcome — it is how the catalog learns recipe language, and it is nearly always right when create feels tempting.\n\nOnly create when nothing in the catalog is the same food. Put the canonical name in name and the recipe-language wording in aliases: matching searches both, so the aliases are what make the row findable from a recipe line. Nutrition values are given as measured for a portion: whenever you pass nutrition, the nutrition_portion field is REQUIRED (the call is rejected without it — note this is its own field; food_portions does NOT satisfy it); omit both to create the row with no nutrition, in which case nutrition_portion is not needed. Example: calories per 1 tbsp with nutrition_portion { gramWeight: 14, amount: 1, modifier: \"tbsp\" }. The server converts deterministically for storage and saves the portion on the ingredient. density_g_per_ml converts volume↔weight (grams = ml × density). The matching embedding is derived server-side from name + aliases — you never supply it. source defaults to 'manual'.",
    inputSchema: TOOL_SCHEMAS.create_ingredient,
    call: (args) => createIngredient(ingredientCreateToolInputSchema.parse(args)),
  },
  {
    name: "update_ingredient",
    description:
      "Patch fields on a catalog ingredient — only the fields you pass change. This is also how you TEACH THE CATALOG A NEW NAME: when search_ingredients found the right food under wording a recipe would not use, add that recipe wording to this row's aliases rather than creating a second row. Renaming OR changing aliases re-derives the matching embedding server-side (it spans both), which is what makes the new wording findable afterwards. aliases REPLACES the whole array rather than appending — ALWAYS call get_ingredient first and pass the existing aliases back alongside the one you are adding, or you will silently delete the names the catalog already learned. To change nutrition, pass nutrition as measured for a portion: whenever you pass nutrition values, the nutrition_portion field is REQUIRED (the call is rejected without it — note this is its own field; food_portions does NOT satisfy it); the one exception is nutrition: null, which clears the stored nutrition and needs no nutrition_portion. The stored nutrition is replaced to match the given values + nutrition_portion (whole object, deterministic conversion; the portion itself is not saved). Fails with 'conflict' if the new name (case-insensitive) or fdc_id collides with another row.",
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
      // Argument validation failures otherwise surface as a raw JSON issues
      // array with no framing — an agent got stuck retrying against exactly
      // that. Name the tool and each offending field so the caller can fix
      // the arguments instead of guessing.
      if (err instanceof ZodError) {
        const detail = err.issues
          .map((i) => `${i.path.length > 0 ? i.path.join(".") : "(arguments)"}: ${i.message}`)
          .join("; ");
        return {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              { type: "text", text: `invalid_arguments: ${params.name} — ${detail}` },
            ],
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
