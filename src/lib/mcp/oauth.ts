import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { nanoid } from "nanoid";
import { env } from "@/env";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const AUTH_CODE_TTL_SECONDS = 60 * 10; // 10 minutes
export const JWT_AUDIENCE = "mcp";
export const DEFAULT_SCOPE = "mcp";

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
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
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
  if (method !== "S256") return false;
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
