import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { generateClientId, generateClientSecret, hashSecret } from "@/lib/mcp/oauth";

interface RegistrationRequest {
  client_name?: string;
  redirect_uris?: string[];
  token_endpoint_auth_method?: "none" | "client_secret_post" | "client_secret_basic";
}

// OAuth 2.1 best practice (RFC 8252 §7.3, §8.4): public clients use either
// HTTPS callbacks (web-hosted clients like Claude.ai) or HTTP loopback (desktop
// apps). Other schemes — http://example.com, file://, custom URL schemes —
// are rejected to avoid both insecure transport and open-redirector abuse.
function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") {
    return (
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "[::1]"
    );
  }
  return false;
}

export async function POST(request: Request) {
  let body: RegistrationRequest;
  try {
    body = (await request.json()) as RegistrationRequest;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (redirectUris.length === 0) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris is required" },
      { status: 400 },
    );
  }

  for (const uri of redirectUris) {
    if (!isAllowedRedirectUri(uri)) {
      return NextResponse.json(
        {
          error: "invalid_redirect_uri",
          error_description: `redirect_uri must be HTTPS or HTTP loopback (got ${uri})`,
        },
        { status: 400 },
      );
    }
  }

  const authMethod = body.token_endpoint_auth_method ?? "none";
  if (authMethod !== "none") {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: "Only public clients (token_endpoint_auth_method=none) are supported",
      },
      { status: 400 },
    );
  }

  const clientId = generateClientId();
  // For "none" auth method (PKCE-only public client) no secret is issued.
  const clientSecret: string | null = null;
  const clientSecretHash = clientSecret ? hashSecret(clientSecret) : null;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("oauth_clients").insert({
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    client_name: body.client_name?.slice(0, 200) ?? "Unnamed MCP Client",
    redirect_uris: redirectUris,
    token_endpoint_auth_method: authMethod,
  });

  if (error) {
    return NextResponse.json(
      { error: "server_error", error_description: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    client_id: clientId,
    client_name: body.client_name ?? "Unnamed MCP Client",
    redirect_uris: redirectUris,
    token_endpoint_auth_method: authMethod,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
}
