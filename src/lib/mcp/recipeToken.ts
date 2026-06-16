import { randomUUID } from "crypto";
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

// Human-readable TTL for agent-facing tool descriptions. Derived from the
// constant above so the prose never drifts when the TTL changes.
export const RECIPE_TOKEN_TTL_LABEL =
  RECIPE_TOKEN_TTL_SECONDS % 60 === 0
    ? `${RECIPE_TOKEN_TTL_SECONDS / 60}-minute`
    : `${RECIPE_TOKEN_TTL_SECONDS}-second`;

let cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (!cachedSecret) cachedSecret = new TextEncoder().encode(env.OAUTH_JWT_SECRET);
  return cachedSecret;
}

// Single-use enforcement. Tokens carry a unique `jti`; once a token is spent
// (a successful upload), its jti lands here and `verifyRecipeToken` rejects it.
// Entries are pruned once past their own expiry, so the map never holds more
// than the tokens minted within one ~5-minute window. This is per-process: a
// container restart clears it, reopening at most a token's remaining TTL as a
// replay window — acceptable for a single-instance, single-user deployment.
const consumed = new Map<string, number>(); // jti -> expiry epoch ms

function purgeExpired(now = Date.now()): void {
  for (const [jti, expiresAt] of consumed) {
    if (expiresAt <= now) consumed.delete(jti);
  }
}

export async function signRecipeToken(recipeId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(env.MCP_PUBLIC_URL)
    .setAudience(RECIPE_TOKEN_AUDIENCE)
    .setSubject(recipeId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${RECIPE_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

/**
 * True iff `token` is a valid, unexpired recipe token whose subject matches
 * `recipeId` AND has not already been consumed. Swallows verification errors
 * (bad signature, expiry, wrong audience, malformed) and returns false —
 * callers only care about the boolean.
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
    if (payload.sub !== recipeId) return false;
    if (typeof payload.jti === "string" && consumed.has(payload.jti)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Mark a token as spent so it can no longer be verified. Re-verifies first
 * (cheap HMAC) to read the `jti`/`exp`; a missing, invalid, or expired token
 * is a no-op, so callers can pass any candidate string blindly.
 */
export async function consumeRecipeToken(token: string): Promise<void> {
  if (!token) return;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: env.MCP_PUBLIC_URL,
      audience: RECIPE_TOKEN_AUDIENCE,
    });
    if (typeof payload.jti !== "string") return;
    const expiresAt =
      typeof payload.exp === "number"
        ? payload.exp * 1000
        : Date.now() + RECIPE_TOKEN_TTL_SECONDS * 1000;
    purgeExpired();
    consumed.set(payload.jti, expiresAt);
  } catch {
    // Nothing to consume — invalid or already-expired tokens are inert.
  }
}
