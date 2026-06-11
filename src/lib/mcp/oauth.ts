import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { nanoid } from "nanoid";
import { env } from "@/env";

// TTLs are stored in milliseconds (the native JS unit). Convert to seconds at
// the boundaries that need it: jose's `setExpirationTime` accepts a duration
// string like "3600s", and the OAuth `expires_in` response field is in seconds.
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const REFRESH_TOKEN_TTL_MS = 60 * 60 * 24 * 30 * 1000; // 30 days
export const AUTH_CODE_TTL_MS = 60 * 10 * 1000; // 10 minutes

export const JWT_AUDIENCE = "mcp";
export const DEFAULT_SCOPE = "mcp";

// OAuth 2.1 `response_type` values we accept. We only support the
// authorization-code flow; `token` (implicit) was removed in OAuth 2.1.
export const ResponseType = {
  CODE: "code",
} as const;
export type ResponseType = (typeof ResponseType)[keyof typeof ResponseType];

// PKCE code challenge methods (RFC 7636). `plain` is allowed by the spec but
// strongly discouraged; we only accept `S256`.
export const CodeChallengeMethod = {
  S256: "S256",
} as const;
export type CodeChallengeMethod =
  (typeof CodeChallengeMethod)[keyof typeof CodeChallengeMethod];

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
