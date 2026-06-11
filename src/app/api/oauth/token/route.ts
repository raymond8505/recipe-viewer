import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import {
  ACCESS_TOKEN_TTL_MS,
  DEFAULT_SCOPE,
  REFRESH_TOKEN_TTL_MS,
  generateRefreshToken,
  signAccessToken,
  hashSecret,
  verifyPKCE,
} from "@/lib/mcp/oauth";

function err(error: string, description?: string, status = 400) {
  return NextResponse.json(
    description ? { error, error_description: description } : { error },
    { status },
  );
}

async function parseBody(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json()) as Record<string, string>;
  }
  // application/x-www-form-urlencoded is the spec default for OAuth token endpoints.
  const text = await request.text();
  const params = new URLSearchParams(text);
  return Object.fromEntries(params.entries());
}

async function issueTokens(clientId: string, scope: string) {
  const accessToken = await signAccessToken({ clientId, scope });
  const refreshToken = generateRefreshToken();
  const supabase = getSupabaseClient();
  await supabase.from("oauth_refresh_tokens").insert({
    token_hash: hashSecret(refreshToken),
    client_id: clientId,
    scope,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
  });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    // OAuth spec: `expires_in` is seconds (we store ms natively).
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope,
  };
}

export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    body = await parseBody(request);
  } catch {
    return err("invalid_request", "Could not parse body");
  }

  const grantType = body.grant_type;
  const supabase = getSupabaseClient();

  if (grantType === "authorization_code") {
    const { code, redirect_uri: redirectUri, code_verifier: codeVerifier, client_id: clientId } = body;
    if (!code || !redirectUri || !codeVerifier || !clientId) {
      return err("invalid_request", "Missing code, redirect_uri, code_verifier, or client_id");
    }

    const { data: row, error } = await supabase
      .from("oauth_codes")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !row) return err("invalid_grant", "Code not found");
    if (row.consumed) return err("invalid_grant", "Code already used");
    if (row.client_id !== clientId) return err("invalid_grant", "Code/client mismatch");
    if (row.redirect_uri !== redirectUri) return err("invalid_grant", "Redirect URI mismatch");
    if (new Date(row.expires_at).getTime() < Date.now()) return err("invalid_grant", "Code expired");
    if (!verifyPKCE(codeVerifier, row.code_challenge, row.code_challenge_method)) {
      return err("invalid_grant", "PKCE verification failed");
    }

    await supabase.from("oauth_codes").update({ consumed: true }).eq("code", code);

    const tokens = await issueTokens(row.client_id, row.scope);
    return NextResponse.json(tokens, {
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    });
  }

  if (grantType === "refresh_token") {
    const { refresh_token: refreshToken, client_id: clientId } = body;
    if (!refreshToken || !clientId) return err("invalid_request", "Missing refresh_token or client_id");

    const tokenHash = hashSecret(refreshToken);
    const { data: row, error } = await supabase
      .from("oauth_refresh_tokens")
      .select("*")
      .eq("token_hash", tokenHash)
      .single();

    if (error || !row) return err("invalid_grant", "Refresh token not found");
    if (row.revoked) return err("invalid_grant", "Refresh token revoked");
    if (row.client_id !== clientId) return err("invalid_grant", "Token/client mismatch");
    if (new Date(row.expires_at).getTime() < Date.now()) return err("invalid_grant", "Refresh token expired");

    // Rotate: revoke the old token, issue a new pair.
    await supabase.from("oauth_refresh_tokens").update({ revoked: true }).eq("token_hash", tokenHash);

    const tokens = await issueTokens(row.client_id, row.scope ?? DEFAULT_SCOPE);
    return NextResponse.json(tokens, {
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    });
  }

  return err("unsupported_grant_type", `grant_type '${grantType}' is not supported`);
}
