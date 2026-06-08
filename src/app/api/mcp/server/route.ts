import { handleJsonRpc, type JsonRpcRequest } from "@/lib/mcp/server";
import { verifyAccessToken } from "@/lib/mcp/oauth";
import { env } from "@/env";

function unauthorized() {
  const realm = `Bearer resource_metadata="${env.MCP_PUBLIC_URL}/.well-known/oauth-protected-resource"`;
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Unauthorized" } },
    { status: 401, headers: { "WWW-Authenticate": realm } },
  );
}

async function authorize(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return false;
  try {
    await verifyAccessToken(token);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!(await authorize(request))) return unauthorized();

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  const response = await handleJsonRpc(body);
  if (response === null) return new Response(null, { status: 204 });
  return Response.json(response);
}

// Streamable HTTP MCP clients may probe GET/DELETE for session affinity.
// Stateless mode: explicitly say "no session, no streams here."
export function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}

export function DELETE() {
  return new Response("Method Not Allowed", { status: 405 });
}
