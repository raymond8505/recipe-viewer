import { SignJWT, jwtVerify } from "jose";
import { env } from "@/env";

// Short-lived, recipe-scoped capability tokens.
//
// These are NOT the OAuth access tokens that authenticate an MCP client — that
// handshake is managed by the MCP client and is never exposed to the agent.
// Instead, an already-authenticated agent calls the `get_token` MCP tool to
// mint one of these for a *specific* recipe id; it can then pass the token to
// an agent-facing HTTP endpoint (e.g. the multipart image upload). The token
// is bound to a single recipe (the JWT `sub`) and expires in 5 minutes, so a
// leaked token grants nothing beyond that one recipe for that short window.
//
// A distinct audience keeps these from being interchangeable with OAuth access
// tokens (audience "mcp") signed with the same secret.
const RECIPE_TOKEN_AUDIENCE = "recipe-action";
export const RECIPE_TOKEN_TTL_SECONDS = 5 * 60;

let cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (!cachedSecret) cachedSecret = new TextEncoder().encode(env.OAUTH_JWT_SECRET);
  return cachedSecret;
}

export async function signRecipeToken(recipeId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(env.MCP_PUBLIC_URL)
    .setAudience(RECIPE_TOKEN_AUDIENCE)
    .setSubject(recipeId)
    .setIssuedAt()
    .setExpirationTime(`${RECIPE_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

/**
 * True iff `token` is a valid, unexpired recipe token whose subject matches
 * `recipeId`. Swallows verification errors (bad signature, expiry, wrong
 * audience, malformed) and returns false — callers only care about the boolean.
 */
export async function verifyRecipeToken(
  token: string,
  recipeId: string,
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: env.MCP_PUBLIC_URL,
      audience: RECIPE_TOKEN_AUDIENCE,
    });
    return payload.sub === recipeId;
  } catch {
    return false;
  }
}
