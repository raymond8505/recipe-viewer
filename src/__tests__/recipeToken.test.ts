// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    OAUTH_JWT_SECRET: "test-secret-must-be-at-least-32-characters-long!",
    MCP_PUBLIC_URL: "http://localhost:3000",
  },
}));

import {
  consumeRecipeToken,
  RECIPE_TOKEN_TTL_SECONDS,
  signRecipeToken,
  verifyRecipeToken,
} from "@/lib/mcp/recipeToken";

function decodeJti(token: string): string {
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString(),
  );
  return payload.jti;
}

describe("recipe tokens", () => {
  it("uses a 5-minute TTL", () => {
    expect(RECIPE_TOKEN_TTL_SECONDS).toBe(300);
  });

  it("verifies a freshly signed token against its own recipe id", async () => {
    const token = await signRecipeToken("recipe-1");
    expect(await verifyRecipeToken(token, "recipe-1")).toBe(true);
  });

  it("rejects a token presented for a different recipe id", async () => {
    const token = await signRecipeToken("recipe-1");
    expect(await verifyRecipeToken(token, "recipe-2")).toBe(false);
  });

  it("rejects a malformed / non-JWT token", async () => {
    expect(await verifyRecipeToken("not-a-jwt", "recipe-1")).toBe(false);
  });

  it("rejects an already-expired token", async () => {
    vi.useFakeTimers();
    try {
      const token = await signRecipeToken("recipe-1");
      // Advance past the 5-minute TTL (+ jose's small clock tolerance).
      vi.setSystemTime(Date.now() + (RECIPE_TOKEN_TTL_SECONDS + 60) * 1000);
      expect(await verifyRecipeToken(token, "recipe-1")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives every token a distinct jti", async () => {
    const a = await signRecipeToken("recipe-1");
    const b = await signRecipeToken("recipe-1");
    expect(decodeJti(a)).not.toBe(decodeJti(b));
  });

  it("rejects a token after it has been consumed (single-use)", async () => {
    const token = await signRecipeToken("recipe-1");
    expect(await verifyRecipeToken(token, "recipe-1")).toBe(true);

    await consumeRecipeToken(token);

    expect(await verifyRecipeToken(token, "recipe-1")).toBe(false);
  });

  it("consuming one token does not affect a different fresh token", async () => {
    const spent = await signRecipeToken("recipe-1");
    const fresh = await signRecipeToken("recipe-1");
    await consumeRecipeToken(spent);

    expect(await verifyRecipeToken(spent, "recipe-1")).toBe(false);
    expect(await verifyRecipeToken(fresh, "recipe-1")).toBe(true);
  });

  it("consuming a garbage or empty token is a safe no-op", async () => {
    await expect(consumeRecipeToken("not-a-jwt")).resolves.toBeUndefined();
    await expect(consumeRecipeToken("")).resolves.toBeUndefined();
  });
});
