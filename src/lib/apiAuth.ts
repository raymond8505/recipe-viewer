import { NextResponse } from "next/server";
import { getIsLoggedIn } from "@/lib/auth";
import { consumeRecipeToken, verifyRecipeToken } from "@/lib/mcp/recipeToken";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

async function hasValidRecipeToken(
  request: Request,
  recipeId: string,
): Promise<boolean> {
  const token = getBearerToken(request);
  if (!token) return false;
  return verifyRecipeToken(token, recipeId);
}

/**
 * Per-route auth guard for mutating `/api/recipes/[id]/*` handlers.
 *
 * Accepts EITHER a logged-in browser session (the `auth_session` cookie, via
 * {@link getIsLoggedIn}) OR a short-lived, recipe-scoped bearer token whose
 * subject matches `recipeId` (the agent path — minted by the `get_token` MCP
 * tool, validated via {@link verifyRecipeToken}). Returns a 401 `Response` when
 * neither holds, or `null` when the request is authorized.
 *
 * The agent never sees the OAuth access token used to authenticate the MCP
 * session — that handshake happens outside its view. It mints a token scoped to
 * the single recipe it is working on and passes that instead, so a leaked token
 * is useless beyond that one recipe for ~5 minutes.
 *
 * This is a *per-route* check by design: Next.js middleware/proxy is not a
 * security boundary (it is bypassable — CVE-2025-29927), so every mutating
 * handler must call this itself rather than relying on an edge pass.
 *
 * Usage:
 * ```ts
 * const { id } = await params;
 * const unauthorized = await requireApiAuth(req, id);
 * if (unauthorized) return unauthorized;
 * ```
 */
export async function requireApiAuth(
  request: Request,
  recipeId: string,
): Promise<Response | null> {
  if (await getIsLoggedIn()) return null;
  if (await hasValidRecipeToken(request, recipeId)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Spend the recipe-scoped token on a request, if it carries one — call this
 * after an operation the token authorized has succeeded, so the token can't be
 * replayed. No-op for the cookie (browser) path, which carries no bearer token.
 */
export async function consumeRequestToken(request: Request): Promise<void> {
  const token = getBearerToken(request);
  if (token) await consumeRecipeToken(token);
}
