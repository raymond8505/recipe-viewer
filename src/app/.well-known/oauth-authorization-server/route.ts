import { env } from "@/env";

export function GET() {
  return Response.json({
    issuer: env.MCP_PUBLIC_URL,
    authorization_endpoint: `${env.MCP_PUBLIC_URL}/oauth/authorize`,
    token_endpoint: `${env.MCP_PUBLIC_URL}/api/oauth/token`,
    registration_endpoint: `${env.MCP_PUBLIC_URL}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  });
}
