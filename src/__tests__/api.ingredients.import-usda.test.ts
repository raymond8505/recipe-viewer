import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/ingredients/import-usda/route";
import { importUsdaIngredient } from "@/lib/ingredientImport";
import { IngredientRepoError } from "@/lib/ingredients";
import { UsdaError } from "@/lib/usda";
import { getIsLoggedIn } from "@/lib/auth";
import { makeIngredient } from "@/fixtures";
import { makeJsonRequest } from "@/fixtures/request";

vi.mock("@/lib/ingredientImport", () => ({ importUsdaIngredient: vi.fn() }));

vi.mock("@/env", () => ({
  env: { USDA_API_KEY: "test-usda-key" },
}));

vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE: "auth_session",
  getIsLoggedIn: vi.fn().mockResolvedValue(true),
  getExpectedToken: () => "unused-in-test",
}));

describe("POST /api/ingredients/import-usda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);
    vi.mocked(importUsdaIngredient).mockResolvedValue(
      makeIngredient("ing-new", "gochujang"),
    );
  });

  it("imports with the recipe-language name and returns the row", async () => {
    const res = await POST(
      makeJsonRequest({ fdcId: 123, name: "gochujang" }, { method: "POST" }),
    );

    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("ing-new");
    // The manual pick is authoritative — a same-name row is overwritten, not reused.
    expect(importUsdaIngredient).toHaveBeenCalledWith("gochujang", 123, {
      onConflict: "overwrite",
    });
  });

  it("rejects an invalid body with 400", async () => {
    const res = await POST(
      makeJsonRequest({ fdcId: "not-a-number", name: "" }, { method: "POST" }),
    );

    expect(res.status).toBe(400);
    expect(importUsdaIngredient).not.toHaveBeenCalled();
  });

  it("maps a null import (embedding unavailable) to 503", async () => {
    vi.mocked(importUsdaIngredient).mockResolvedValue(null);

    const res = await POST(
      makeJsonRequest({ fdcId: 123, name: "gochujang" }, { method: "POST" }),
    );

    expect(res.status).toBe(503);
  });

  it("maps UsdaError to 502", async () => {
    vi.mocked(importUsdaIngredient).mockRejectedValueOnce(new UsdaError(500, "down"));

    const res = await POST(
      makeJsonRequest({ fdcId: 123, name: "gochujang" }, { method: "POST" }),
    );

    expect(res.status).toBe(502);
  });

  it("maps repo failures to 500", async () => {
    vi.mocked(importUsdaIngredient).mockRejectedValueOnce(
      new IngredientRepoError("conflict", "unresolved"),
    );

    const res = await POST(
      makeJsonRequest({ fdcId: 123, name: "gochujang" }, { method: "POST" }),
    );

    expect(res.status).toBe(500);
  });
});
