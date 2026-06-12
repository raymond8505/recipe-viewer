// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    OAUTH_JWT_SECRET: "test-secret-must-be-at-least-32-characters-long!",
    MCP_PUBLIC_URL: "http://localhost:3000",
  },
}));

import {
  generateClientId,
  generateClientSecret,
  generateCode,
  generateRefreshToken,
  hashSecret,
  signAccessToken,
  verifyAccessToken,
  verifyPKCE,
  verifySecret,
} from "@/lib/mcp/oauth";
import { createHash } from "crypto";

function pkceChallenge(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest()
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("signAccessToken / verifyAccessToken", () => {
  it("round-trips a signed token", async () => {
    const token = await signAccessToken({ clientId: "client_abc", scope: "mcp" });
    const claims = await verifyAccessToken(token);
    expect(claims).toEqual({ clientId: "client_abc", scope: "mcp" });
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signAccessToken({ clientId: "x", scope: "mcp" });
    const tampered = token.slice(0, -3) + (token.endsWith("a") ? "bbb" : "aaa");
    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });

  it("rejects malformed tokens", async () => {
    await expect(verifyAccessToken("not-a-jwt")).rejects.toThrow();
  });
});

describe("verifyPKCE", () => {
  // RFC 7636 §4.1: verifier is 43-128 chars of [A-Z / a-z / 0-9 / - / . / _ / ~]
  const verifier = "a".repeat(48);

  it("accepts a matching S256 verifier", () => {
    expect(verifyPKCE(verifier, pkceChallenge(verifier), "S256")).toBe(true);
  });

  it("rejects a non-matching verifier", () => {
    expect(verifyPKCE("b".repeat(48), pkceChallenge(verifier), "S256")).toBe(false);
  });

  it("rejects plain method (only S256 is supported)", () => {
    expect(verifyPKCE(verifier, verifier, "plain")).toBe(false);
  });

  it("rejects too-short verifiers", () => {
    expect(verifyPKCE("a".repeat(10), pkceChallenge("a".repeat(10)), "S256")).toBe(false);
  });
});

describe("hashSecret / verifySecret", () => {
  it("verifies the same secret", () => {
    const hash = hashSecret("hello");
    expect(verifySecret("hello", hash)).toBe(true);
  });

  it("rejects a different secret", () => {
    const hash = hashSecret("hello");
    expect(verifySecret("hello-but-different", hash)).toBe(false);
  });
});

describe("generators", () => {
  it("emits client ids prefixed with client_", () => {
    expect(generateClientId()).toMatch(/^client_/);
  });

  it("emits unique codes / secrets / refresh tokens", () => {
    expect(new Set([generateCode(), generateCode(), generateCode()]).size).toBe(3);
    expect(new Set([generateClientSecret(), generateClientSecret()]).size).toBe(2);
    expect(new Set([generateRefreshToken(), generateRefreshToken()]).size).toBe(2);
  });
});
