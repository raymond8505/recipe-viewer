import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "@/app/api/ingredients/[id]/route";
import {
  IngredientRepoError,
  deleteIngredientRow,
  getIngredientById,
  updateIngredientRow,
} from "@/lib/ingredients";
import { generateEmbedding } from "@/lib/embedding";
import { getIsLoggedIn } from "@/lib/auth";
import { makeIngredient } from "@/fixtures";
import { makeJsonRequest } from "@/fixtures/request";

vi.mock("@/lib/ingredients", async (orig) => {
  const actual = await orig<typeof import("@/lib/ingredients")>();
  return {
    ...actual,
    updateIngredientRow: vi.fn(),
    deleteIngredientRow: vi.fn(),
    // The re-embed branch reads the row so a one-sided name/aliases patch can
    // embed both fields together.
    getIngredientById: vi.fn(),
  };
});

vi.mock("@/lib/embedding", () => ({ generateEmbedding: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE: "auth_session",
  getIsLoggedIn: vi.fn().mockResolvedValue(true),
  getExpectedToken: () => "unused-in-test",
}));

function makeParams(id = "ing-1") {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/ingredients/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);
    vi.mocked(generateEmbedding).mockResolvedValue([0.3, 0.4]);
    vi.mocked(getIngredientById).mockResolvedValue(
      makeIngredient("ing-1", "Spices, cumin seed", { aliases: ["cumin"] }),
    );
    vi.mocked(updateIngredientRow).mockResolvedValue(
      makeIngredient("ing-1", "cumin seed"),
    );
  });

  it("re-embeds name AND aliases when the name changes", async () => {
    // The vector spans both fields, so a rename has to carry the row's current
    // aliases into the embedded text or they'd silently drop out of matching.
    const res = await PATCH(
      makeJsonRequest({ name: "Cumin Seed" }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(generateEmbedding).toHaveBeenCalledWith("cumin seed, cumin");
    expect(updateIngredientRow).toHaveBeenCalledWith(
      "ing-1",
      expect.objectContaining({ name: "Cumin Seed", embedding: [0.3, 0.4] }),
    );
  });

  it("re-embeds when only the aliases change", async () => {
    await PATCH(
      makeJsonRequest({ aliases: ["jeera", "comino"] }, { method: "PATCH" }),
      makeParams(),
    );

    expect(generateEmbedding).toHaveBeenCalledWith(
      "spices, cumin seed, jeera, comino",
    );
  });

  it("does not embed for a patch that leaves the name alone", async () => {
    await PATCH(
      makeJsonRequest({ density_g_per_ml: 0.5 }, { method: "PATCH" }),
      makeParams(),
    );

    expect(generateEmbedding).not.toHaveBeenCalled();
    expect(updateIngredientRow).toHaveBeenCalledWith(
      "ing-1",
      expect.objectContaining({ density_g_per_ml: 0.5 }),
    );
  });

  it("rejects an invalid patch with 400", async () => {
    const res = await PATCH(
      makeJsonRequest({ name: "" }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(400);
    expect(updateIngredientRow).not.toHaveBeenCalled();
  });

  it("maps not_found to 404", async () => {
    vi.mocked(updateIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("not_found", "gone"),
    );

    const res = await PATCH(
      makeJsonRequest({ density_g_per_ml: 1 }, { method: "PATCH" }),
      makeParams("nope"),
    );

    expect(res.status).toBe(404);
  });

  it("maps a rename collision to 409", async () => {
    vi.mocked(updateIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("conflict", "taken"),
    );

    const res = await PATCH(
      makeJsonRequest({ name: "taken" }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(409);
  });

  it("maps other repo failures to 500", async () => {
    vi.mocked(updateIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("update_failed", "boom"),
    );

    const res = await PATCH(
      makeJsonRequest({ density_g_per_ml: 1 }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/ingredients/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);
    vi.mocked(deleteIngredientRow).mockResolvedValue(undefined);
  });

  it("deletes and confirms", async () => {
    const res = await DELETE(
      new Request("http://localhost/api/ingredients/ing-1", { method: "DELETE" }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(deleteIngredientRow).toHaveBeenCalledWith("ing-1");
  });

  it("maps not_found to 404", async () => {
    vi.mocked(deleteIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("not_found", "gone"),
    );

    const res = await DELETE(
      new Request("http://localhost/api/ingredients/nope", { method: "DELETE" }),
      makeParams("nope"),
    );

    expect(res.status).toBe(404);
  });

  it("maps other repo failures to 500", async () => {
    vi.mocked(deleteIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("delete_failed", "boom"),
    );

    const res = await DELETE(
      new Request("http://localhost/api/ingredients/ing-1", { method: "DELETE" }),
      makeParams(),
    );

    expect(res.status).toBe(500);
  });
});
