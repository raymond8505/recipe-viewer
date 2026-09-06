import { ZodError } from "zod";
import { TOOL_SCHEMAS } from "./schemas";
import { RECIPE_TOKEN_TTL_LABEL } from "./recipeToken";
import { TOOL, TOOL_NAMES, type ToolName } from "./toolNames";
import {
  IMAGE_FORMAT_LIST,
  INGREDIENT_DETAIL_ONLY_LIST,
  METRIC_UNIT_SLASHES,
  NUTRITION_FIELD_LIST,
  TBSP_ML_EXAMPLE,
} from "./copy";
import {
  DEFAULT_INGREDIENT_SOURCE,
} from "@/lib/schemas/ingredient";
import {
  ARCHIVED_RECIPE_STATUS,
  DEFAULT_RECIPE_STATUS,
} from "@/lib/schemas/recipe";
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
  RECIPE_SEARCH_RESULT_FIELDS,
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
  name: ToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (args: unknown) => Promise<unknown>;
}

// Keyed by ToolName so a tool with a schema but no implementation — or an
// implementation with no schema — is a compile error rather than a tool that
// silently never lists.
//
// Descriptions interpolate the code they cite (see ./copy and ./toolNames):
// anything that enumerates fields, formats or units, and every mention of
// another tool, is rendered from its source so a rename or a new column can't
// leave an agent following a stale instruction.
const TOOL_IMPLS: {
  [K in ToolName]: Pick<ToolDefinition, "description" | "call">;
} = {
  search_recipes: {
    description: `Search recipes by name, source, or status. Returns a paginated list with total count; each result is trimmed to { ${RECIPE_SEARCH_RESULT_FIELDS.join(", ")} } — call ${TOOL.get_recipe} with an id for the full schema. Use this before ${TOOL.get_recipe} when you only have a name.`,
    call: (args) => searchRecipes(recipeSearchInputSchema.parse(args)),
  },
  search_ingredients: {
    description: `Hybrid keyword + semantic search over the known-ingredient catalog — the FIRST call to make before creating or updating any ingredient. Returns up to \`limit\` rows, each with its aliases, per-100g nutrition (${NUTRITION_FIELD_LIST}) and density_g_per_ml. Density converts volume↔weight: grams = ml × density_g_per_ml (e.g. ${TBSP_ML_EXAMPLE}). Data is USDA FoodData Central or manually curated; null fields mean not yet known.\n\nJUDGING RESULTS — each row carries THREE numbers, and picking the wrong one is the common failure:\n• semantic_similarity (0–1) — meaning-based, the closest thing to a match signal: higher is a better match, and the top result is usually the right food. There is no calibrated cutoff, so treat it as a ranking aid and DECIDE BY READING THE NAME, not by a threshold.\n• keyword_similarity (0–1) — spelling overlap against the name and every alias. ~1.0 means a near-exact name/alias hit, which is strong evidence. Low is NOT disqualifying: the catalog names foods the way USDA does ("Butter, without salt") and recipes don't.\n• score — RANKING ONLY. It is a reciprocal-rank fusion of the two, so it is a tiny number by construction: a PERFECT match scores about 0.04, never near 1.0. Use it to order results and for nothing else.\n\nWHEN UNSURE, PREFER THE EXISTING ROW. The two mistakes are not equal: adding an alias to the wrong row is cheap and reversible, while creating a row for a food already in the catalog splits its nutrition across duplicates and is invisible until someone notices. Judge on whether the name denotes the same food ("Butter, without salt" IS unsalted butter; "Butter oil, anhydrous" is not) and do not let a low number alone talk you out of a match.\n\nCheck the aliases on each result: if your recipe's wording is already there, that row is definitively your ingredient and needs no edit. If the row is the right food but your wording is missing, add it with ${TOOL.update_ingredient} (pass the aliases you see here back alongside the new one — the field replaces the whole array).`,
    call: (args) => searchIngredients(ingredientSearchInputSchema.parse(args)),
  },
  get_ingredient: {
    description: `Fetch the full catalog row for an ingredient UUID — includes fields ${TOOL.search_ingredients} results omit (${INGREDIENT_DETAIL_ONLY_LIST}). Get ids from ${TOOL.search_ingredients}. You do NOT need this just to edit aliases: ${TOOL.search_ingredients} already returns them, so you can pass those straight back to ${TOOL.update_ingredient}. Reach for it when you need the USDA provenance or portion list, or when working from an id you did not just search for.`,
    call: (args) => getIngredient(ingredientIdInputSchema.parse(args)),
  },
  create_ingredient: {
    description: `Add a NEW ingredient to the known-ingredient catalog — the last resort, not the first move. Both name (case-insensitively) and fdc_id are unique.\n\nBEFORE CALLING THIS, call ${TOOL.search_ingredients}. The catalog names foods the way USDA does, so the row you want usually already exists under wording you would not have guessed — "Butter, without salt" is the row for "unsalted butter". Check each result's aliases first — if your recipe's wording is already among them, that row is your ingredient and there is nothing to do. If a result is the same food (see ${TOOL.search_ingredients} on judging semantic_similarity) but lacks your wording, that IS still your ingredient: do NOT create a second row. Instead call ${TOOL.update_ingredient} adding your wording to the aliases the search already returned. Teaching an existing row a new alias is the normal, expected outcome — it is how the catalog learns recipe language, and it is nearly always right when create feels tempting.\n\nOnly create when nothing in the catalog is the same food. Put the canonical name in name and the recipe-language wording in aliases: matching searches both, so the aliases are what make the row findable from a recipe line. Nutrition values are given as measured for a portion: whenever you pass nutrition, the nutrition_portion field is REQUIRED (the call is rejected without it — note this is its own field; food_portions does NOT satisfy it); omit both to create the row with no nutrition, in which case nutrition_portion is not needed. Example: calories per 1 tbsp with nutrition_portion { gramWeight: 14, amount: 1, modifier: "tbsp" }. The server converts deterministically for storage and saves the portion on the ingredient. density_g_per_ml converts volume↔weight (grams = ml × density). The matching embedding is derived server-side from name + aliases — you never supply it. source defaults to '${DEFAULT_INGREDIENT_SOURCE}'.`,
    call: (args) => createIngredient(ingredientCreateToolInputSchema.parse(args)),
  },
  update_ingredient: {
    description: `Patch fields on a catalog ingredient — only the fields you pass change. This is also how you TEACH THE CATALOG A NEW NAME: when ${TOOL.search_ingredients} found the right food under wording a recipe would not use, add that recipe wording to this row's aliases rather than creating a second row. Renaming OR changing aliases re-derives the matching embedding server-side (it spans both), which is what makes the new wording findable afterwards. aliases REPLACES the whole array rather than appending — ALWAYS pass the row's existing aliases back alongside the one you are adding, or you will silently delete the names the catalog already learned. ${TOOL.search_ingredients} returns them, so no extra call is needed; use ${TOOL.get_ingredient} if you are working from an id you did not just search for. To change nutrition, pass nutrition as measured for a portion: whenever you pass nutrition values, the nutrition_portion field is REQUIRED (the call is rejected without it — note this is its own field; food_portions does NOT satisfy it); the one exception is nutrition: null, which clears the stored nutrition and needs no nutrition_portion. The stored nutrition is replaced to match the given values + nutrition_portion (whole object, deterministic conversion; the portion itself is not saved). Fails with 'conflict' if the new name (case-insensitive) or fdc_id collides with another row.`,
    call: (args) => updateIngredient(ingredientUpdateToolInputSchema.parse(args)),
  },
  delete_ingredient: {
    description: `PERMANENTLY delete a catalog ingredient (hard delete — there is no archive state, unlike ${TOOL.delete_recipe}). Recipe lines that referenced it keep their parsed text/quantities but detach (their ingredient_id nulls out), so those recipes lose ingredient-derived nutrition until re-matched. Prefer ${TOOL.update_ingredient} to fix a bad row.`,
    call: (args) => deleteIngredient(ingredientIdInputSchema.parse(args)),
  },
  get_recipe: {
    description: `Fetch the full recipe row for a given recipe UUID. metadata.schema is the WHOLE recipe (SchemaRecipe): each recipeIngredient line is an object whose id is its recipe_ingredients row — keep that id when you send lines back through ${TOOL.update_recipe}. The row also carries the raw storage: ingredients (ordered groups of row ids) and ingredientRows (the parsed lines with their catalog associations).`,
    call: (args) => getRecipe(recipeIdInputSchema.parse(args)),
  },
  get_token: {
    description: `Mint a short-lived (${RECIPE_TOKEN_TTL_LABEL}) bearer token scoped to a single recipe UUID. Required to authenticate agent-facing HTTP endpoints such as the multipart image upload (POST /api/recipes/<id>/upload-image) — call this first, then pass the returned token as \`Authorization: Bearer <token>\`. The token only works for the recipe id you pass here. Returns { token, recipeId, expiresInSeconds }.`,
    call: (args) => getToken(recipeIdInputSchema.parse(args)),
  },
  create_recipe: {
    description: `Insert a new recipe row. Requires source and a SchemaRecipe object; defaults status to '${DEFAULT_RECIPE_STATUS}'. url is OPTIONAL — when omitted it defaults to the recipe's own canonical page on this instance (<base-url>/recipes/<new-uuid>). Set recipeYield as a structured QuantitativeValue — value = serving count, unitText = its label, and valueReference = the recipe's raw weight/volume in metric units (value + unitText; unitText must be one of ${METRIC_UNIT_SLASHES}) when known, since it drives the per-serving nutrition; a plain-string yield is accepted but deprecated. cookingNotes is read-only for agents: if present it is ignored (the call still succeeds) and the response carries a 'warnings' note explaining why.`,
    call: (args) => createRecipe(recipeCreateInputSchema.parse(args)),
  },
  update_recipe: {
    description: `Patch fields on an existing recipe — only the fields you pass change. Within schema, most fields merge into what is stored, but recipeIngredient and recipeInstructions REPLACE the whole list when present. Send every ingredient line back with the id ${TOOL.get_recipe} returned for it: a line without an id (or with an unknown one) becomes a new row and loses the catalog association curated on the old one. Prefer a structured QuantitativeValue for recipeYield (value = serving count, unitText = its label, valueReference = raw weight/volume in metric units ${METRIC_UNIT_SLASHES} for per-serving nutrition); plain-string yields are accepted but deprecated. cookingNotes is read-only for agents: if present it is ignored (the call still succeeds) and the response carries a 'warnings' note. Use ${TOOL.clear_cooking_notes} to clear it.`,
    call: (args) => updateRecipe(recipeUpdateInputSchema.parse(args)),
  },
  clear_cooking_notes: {
    description:
      "Clear a recipe's cooking notes (sets cookingNotes to empty). This is the ONLY agent-writable path for cookingNotes — use it only when the user explicitly asks to clear the notes, e.g. after you've applied them.",
    call: (args) => clearCookingNotes(recipeIdInputSchema.parse(args)),
  },
  delete_recipe: {
    description: `Soft-delete a recipe by setting its status to '${ARCHIVED_RECIPE_STATUS}'. Reversible via ${TOOL.update_recipe}.`,
    call: (args) => deleteRecipe(recipeIdInputSchema.parse(args)),
  },
  upload_recipe_image: {
    description: `Set a recipe's image (Supabase Storage + schema.image). Two ways to provide the image: (1) imageUrl when it is reachable at a public http(s) URL — pass it as the imageUrl argument and the server fetches, validates, and uploads it (do NOT fetch it yourself or base64-encode a URL); (2) a local file when you have shell access — this tool does NOT take file bytes; instead first call the ${TOOL.get_token} tool with this recipe's id to obtain a short-lived (${RECIPE_TOKEN_TTL_LABEL}) upload token, then: curl -H "Authorization: Bearer <token-from-${TOOL.get_token}>" -F "file=@<path>" <origin>/api/recipes/<id>/upload-image (same origin as this MCP server; the route returns 401 without a valid token; it sets schema.image by default — add -F "updateSchema=false" only to upload the bytes without repointing the recipe) — the <origin> domain may need to be in your shell/network allowlist for the curl to reach it. Accepts ${IMAGE_FORMAT_LIST}.`,
    call: (args) => uploadRecipeImage(recipeImageUploadInputSchema.parse(args)),
  },
};

export const TOOLS: ToolDefinition[] = TOOL_NAMES.map((name) => ({
  name,
  description: TOOL_IMPLS[name].description,
  inputSchema: TOOL_SCHEMAS[name],
  call: TOOL_IMPLS[name].call,
}));

// Keyed by plain string: the lookup argument is whatever a JSON-RPC caller sent.
const toolByName = new Map<string, ToolDefinition>(TOOLS.map((t) => [t.name, t]));

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
