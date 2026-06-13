// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    OAUTH_JWT_SECRET: "test-secret-must-be-at-least-32-characters-long!",
    MCP_PUBLIC_URL: "http://localhost:3000",
  },
}));

import {
  RECIPE_TOKEN_TTL_SECONDS,
  signRecipeToken,
  verifyRecipeToken,
} from "@/lib/mcp/recipeToken";

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
});
