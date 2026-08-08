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

  it("passes the line's parsed name through as the alias source", async () => {
    const res = await POST(
      makeJsonRequest({ fdcId: 123, name: "gochujang" }, { method: "POST" }),
    );

    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("ing-new");
    // No conflict mode: fdcId is the identity, so the same food always
    // resolves to the same row and there is nothing to fork.
    expect(importUsdaIngredient).toHaveBeenCalledWith("gochujang", 123);
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

  it("maps an upstream USDA 404 to 404 (unknown food, not unavailability)", async () => {
    vi.mocked(importUsdaIngredient).mockRejectedValueOnce(
      new UsdaError(404, "USDA food detail 123 failed (404): "),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      makeJsonRequest({ fdcId: 123, name: "gochujang" }, { method: "POST" }),
    );

    expect(res.status).toBe(404);
    // The real upstream status/detail must land in the server log — the
    // client-facing message is deliberately generic.
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("404"));
    errorSpy.mockRestore();
  });

  it("maps other UsdaErrors (5xx, network) to 502", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const err of [new UsdaError(500, "down"), new UsdaError(null, "timeout")]) {
      vi.mocked(importUsdaIngredient).mockRejectedValueOnce(err);

      const res = await POST(
        makeJsonRequest({ fdcId: 123, name: "gochujang" }, { method: "POST" }),
      );

      expect(res.status).toBe(502);
    }
    // Both upstream failures land in the server log (a null status logs as
    // "network") — the client-facing message stays generic.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("UsdaError (status 500)"),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("UsdaError (status network)"),
    );
    errorSpy.mockRestore();
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
