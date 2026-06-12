import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { nanoid } from "nanoid";
import { env } from "@/env";
import { ACCESS_TOKEN_TTL_MS, CodeChallengeMethod, JWT_AUDIENCE } from "./oauth-constants";

// Re-export the browser-safe constants so existing server-side imports keep
// resolving against `@/lib/mcp/oauth`. New browser-side consumers (stories,
// client utilities) should import directly from `./oauth-constants` to avoid
// pulling in Node's `crypto` module via the rest of this file.
export {
  ACCESS_TOKEN_TTL_MS,
  AUTH_CODE_TTL_MS,
  CodeChallengeMethod,
  DEFAULT_SCOPE,
  JWT_AUDIENCE,
  REFRESH_TOKEN_TTL_MS,
  ResponseType,
} from "./oauth-constants";

let cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (!cachedSecret) cachedSecret = new TextEncoder().encode(env.OAUTH_JWT_SECRET);
  return cachedSecret;
}

export interface AccessTokenClaims {
  clientId: string;
  scope: string;
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ scope: claims.scope })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(env.MCP_PUBLIC_URL)
    .setAudience(JWT_AUDIENCE)
    .setSubject(claims.clientId)
    .setIssuedAt()
    .setExpirationTime(`${Math.floor(ACCESS_TOKEN_TTL_MS / 1000)}s`)
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: env.MCP_PUBLIC_URL,
    audience: JWT_AUDIENCE,
  });
  if (typeof payload.sub !== "string" || typeof payload.scope !== "string") {
    throw new Error("Malformed token");
  }
  return { clientId: payload.sub, scope: payload.scope };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashSecret(value: string): string {
  return sha256(value);
}

export function verifySecret(value: string, hash: string): boolean {
  const a = Buffer.from(sha256(value), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// PKCE: SHA-256(verifier) base64url-encoded must equal the stored challenge.
function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function verifyPKCE(
  verifier: string,
  challenge: string,
  method: string,
): boolean {
  if (method !== CodeChallengeMethod.S256) return false;
  if (verifier.length < 43 || verifier.length > 128) return false;
  const computed = base64UrlEncode(createHash("sha256").update(verifier).digest());
  return computed === challenge;
}

export function generateCode(): string {
  return nanoid(48);
}

export function generateClientId(): string {
  return `client_${nanoid(24)}`;
}

export function generateClientSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}
