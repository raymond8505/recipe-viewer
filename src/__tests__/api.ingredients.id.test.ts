import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "@/app/api/ingredients/[id]/route";
import {
  IngredientRepoError,
  deleteIngredientRow,
  updateIngredientRow,
} from "@/lib/ingredients";
import { generateEmbedding } from "@/lib/embedding";
import { getIsLoggedIn } from "@/lib/auth";
import { makeIngredient } from "@/fixtures";
import { makeJsonRequest } from "@/fixtures/request";

vi.mock("@/lib/ingredients", async (orig) => {
  const actual = await orig<typeof import("@/lib/ingredients")>();
  return { ...actual, updateIngredientRow: vi.fn(), deleteIngredientRow: vi.fn() };
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
    vi.mocked(updateIngredientRow).mockResolvedValue(
      makeIngredient("ing-1", "cumin seed"),
    );
  });

  it("re-embeds when the name changes", async () => {
    const res = await PATCH(
      makeJsonRequest({ name: "cumin seed" }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(generateEmbedding).toHaveBeenCalledWith("cumin seed");
    expect(updateIngredientRow).toHaveBeenCalledWith(
      "ing-1",
      expect.objectContaining({ name: "cumin seed", embedding: [0.3, 0.4] }),
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
