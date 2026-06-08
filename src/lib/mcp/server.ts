import {
  createRecipeArgs,
  deleteRecipeArgs,
  getRecipeArgs,
  searchRecipesArgs,
  TOOL_SCHEMAS,
  updateRecipeArgs,
} from "./schemas";
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  searchRecipes,
  ToolError,
  updateRecipe,
} from "./tools";

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
      "Search recipes by name, source, or status. Returns a paginated list with total count. Use this before get_recipe when you only have a name.",
    inputSchema: TOOL_SCHEMAS.search_recipes,
    call: (args) => searchRecipes(searchRecipesArgs.parse(args)),
  },
  {
    name: "get_recipe",
    description: "Fetch the full recipe row (including metadata.schema) for a given recipe UUID.",
    inputSchema: TOOL_SCHEMAS.get_recipe,
    call: (args) => getRecipe(getRecipeArgs.parse(args)),
  },
  {
    name: "create_recipe",
    description:
      "Insert a new recipe row. Requires url, source, and a SchemaRecipe object. Defaults status to 'draft'.",
    inputSchema: TOOL_SCHEMAS.create_recipe,
    call: (args) => createRecipe(createRecipeArgs.parse(args)),
  },
  {
    name: "update_recipe",
    description:
      "Patch fields on an existing recipe. The schema field is merged into existing metadata.schema (not replaced).",
    inputSchema: TOOL_SCHEMAS.update_recipe,
    call: (args) => updateRecipe(updateRecipeArgs.parse(args)),
  },
  {
    name: "delete_recipe",
    description: "Soft-delete a recipe by setting its status to 'archived'. Reversible via update_recipe.",
    inputSchema: TOOL_SCHEMAS.delete_recipe,
    call: (args) => deleteRecipe(deleteRecipeArgs.parse(args)),
  },
];

const toolByName = new Map(TOOLS.map((t) => [t.name, t]));

// JSON-RPC dispatch shape — same contract as the existing /api/mcp route, but
// extended to handle tools/call by actually invoking server-side functions.

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string; data?: unknown } };

export async function handleJsonRpc(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  // Notifications (no id) get no response per JSON-RPC 2.0.
  if (req.id == null) return null;
  const id = req.id;

  if (req.method === "initialize") {
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

  if (req.method === "tools/list") {
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

  if (req.method === "tools/call") {
    const params = (req.params ?? {}) as { name?: string; arguments?: unknown };
    const tool = params.name ? toolByName.get(params.name) : undefined;
    if (!tool) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: `Unknown tool: ${params.name}` },
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
    error: { code: -32601, message: `Method not found: ${req.method}` },
  };
}
