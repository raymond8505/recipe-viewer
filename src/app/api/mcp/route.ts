import { API_TOOLS } from "@/lib/windowApi";
import type { McpTool } from "@/lib/windowApi";
import { JsonRpcErrorCode, JsonRpcMethod } from "@/lib/mcp/types";
import { PROTOCOL_VERSION } from "@/lib/mcp/server";
import { env } from "@/env";

// Browser-side tools require window execution — annotate descriptions so MCP
// clients know they can't be executed server-side.
const BROWSER_TOOL_NOTE =
  " | Browser tool: execute via window.recipeTools.<name>(args) in the active tab.";

const MCP_TOOLS: McpTool[] = API_TOOLS.map((t) => ({
  ...t,
  description: t.description + BROWSER_TOOL_NOTE.replace("<name>", t.name),
}));

function unauthorized() {
  return Response.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: JsonRpcErrorCode.UNAUTHORIZED, message: "Unauthorized" },
    },
    { status: 401 }
  );
}

function methodNotFound(id: unknown) {
  return Response.json({
    jsonrpc: "2.0",
    id,
    error: { code: JsonRpcErrorCode.METHOD_NOT_FOUND, message: "Method not found" },
  });
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.MCP_API_TOKEN}`) return unauthorized();

  const body = await request.json();

  // JSON-RPC notification — no id, no response expected
  if (!("id" in body)) {
    return new Response(null, { status: 204 });
  }

  const { id, method } = body;

  if (method === JsonRpcMethod.INITIALIZE) {
    return Response.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "recipe-viewer", version: "1.0.0" },
        instructions:
          "All tools in this server are browser-side. They must be executed via window.recipeTools in an active recipe-viewer tab.",
      },
    });
  }

  if (method === JsonRpcMethod.TOOLS_LIST) {
    return Response.json({
      jsonrpc: "2.0",
      id,
      result: { tools: MCP_TOOLS },
    });
  }

  return methodNotFound(id);
}
