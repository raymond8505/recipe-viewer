import { NextResponse } from "next/server";
import { getIsLoggedIn } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { AUTH_CODE_TTL_SECONDS, DEFAULT_SCOPE, generateCode } from "@/lib/mcp/oauth";

function redirectWith(redirectUri: string, params: Record<string, string>): Response {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url, { status: 302 });
}

export async function POST(request: Request) {
  if (!(await getIsLoggedIn())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const form = await request.formData();
  const action = form.get("action");
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const responseType = String(form.get("response_type") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const codeChallengeMethod = String(form.get("code_challenge_method") ?? "");
  const state = String(form.get("state") ?? "");
  const scope = String(form.get("scope") ?? "") || DEFAULT_SCOPE;

  if (!clientId || !redirectUri || responseType !== "code" || codeChallengeMethod !== "S256" || !codeChallenge) {
    return new Response("Bad authorization request", { status: 400 });
  }

  const supabase = getSupabaseClient();
  const { data: client } = await supabase
    .from("oauth_clients")
    .select("client_id, redirect_uris")
    .eq("client_id", clientId)
    .single();

  if (!client || !(client.redirect_uris as string[]).includes(redirectUri)) {
    return new Response("Unknown client or redirect_uri", { status: 400 });
  }

  if (action === "deny") {
    return redirectWith(redirectUri, { error: "access_denied", state });
  }

  if (action !== "allow") {
    return new Response("Bad action", { status: 400 });
  }

  const code = generateCode();
  const { error } = await supabase.from("oauth_codes").insert({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    scope,
    expires_at: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString(),
  });

  if (error) {
    return new Response(`Failed to issue code: ${error.message}`, { status: 500 });
  }

  return redirectWith(redirectUri, { code, state });
}
