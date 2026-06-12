import { env } from "@/env";

export function GET() {
  return Response.json({
    resource: `${env.MCP_PUBLIC_URL}/api/mcp/server`,
    authorization_servers: [env.MCP_PUBLIC_URL],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  });
}
