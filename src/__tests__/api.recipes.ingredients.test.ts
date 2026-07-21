import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/recipes/[id]/ingredients/route";
import { PATCH } from "@/app/api/recipes/[id]/ingredients/[riId]/route";
import {
  IngredientRepoError,
  getIngredientsByIds,
  getRecipeIngredients,
  updateRecipeIngredientAssociation,
} from "@/lib/ingredients";
import { getRecipeById } from "@/lib/recipes";
import { getIsLoggedIn } from "@/lib/auth";
import { makeIngredient, makeRecipe, makeRecipeIngredient } from "@/fixtures";
import { makeJsonRequest } from "@/fixtures/request";

vi.mock("@/lib/ingredients", async (orig) => {
  const actual = await orig<typeof import("@/lib/ingredients")>();
  return {
    ...actual,
    getRecipeIngredients: vi.fn(),
    getIngredientsByIds: vi.fn(),
    updateRecipeIngredientAssociation: vi.fn(),
  };
});

vi.mock("@/lib/recipes", async (orig) => {
  const actual = await orig<typeof import("@/lib/recipes")>();
  return { ...actual, getRecipeById: vi.fn() };
});

vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE: "auth_session",
  getIsLoggedIn: vi.fn().mockResolvedValue(true),
  getExpectedToken: () => "unused-in-test",
}));

describe("GET /api/recipes/[id]/ingredients", () => {
  const makeParams = (id = "r-1") => ({ params: Promise.resolve({ id }) });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);
    vi.mocked(getRecipeById).mockResolvedValue(makeRecipe("r-1", "Test Recipe"));
    vi.mocked(getRecipeIngredients).mockResolvedValue([]);
    vi.mocked(getIngredientsByIds).mockResolvedValue([]);
  });

  it("returns rows plus the deduplicated catalog joins", async () => {
    const rows = [
      makeRecipeIngredient("r-1", 0, { ingredient_id: "ing-1" }),
      makeRecipeIngredient("r-1", 1, { ingredient_id: "ing-1" }),
      makeRecipeIngredient("r-1", 2, { ingredient_id: null }),
    ];
    const ingredients = [makeIngredient("ing-1", "cumin seed")];
    vi.mocked(getRecipeIngredients).mockResolvedValue(rows);
    vi.mocked(getIngredientsByIds).mockResolvedValue(ingredients);

    const res = await GET(
      new Request("http://localhost/api/recipes/r-1/ingredients"),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows, ingredients });
    // Duplicate and null ingredient_ids collapse before the catalog fetch.
    expect(getIngredientsByIds).toHaveBeenCalledWith(["ing-1"]);
  });

  it("404s for an unknown recipe", async () => {
    vi.mocked(getRecipeById).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/recipes/nope/ingredients"),
      makeParams("nope"),
    );

    expect(res.status).toBe(404);
    expect(getRecipeIngredients).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/recipes/[id]/ingredients/[riId]", () => {
  const makeParams = (id = "r-1", riId = "ri-1") => ({
    params: Promise.resolve({ id, riId }),
  });
  const INGREDIENT_UUID = "6b1f0d6e-3a3b-4a5e-9a4e-2f6d8c7b1a2e";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);
    vi.mocked(updateRecipeIngredientAssociation).mockResolvedValue(
      makeRecipeIngredient("r-1", 0, {
        ingredient_id: INGREDIENT_UUID,
        match_status: "manual",
      }),
    );
  });

  it("sets an association and returns the updated row", async () => {
    const res = await PATCH(
      makeJsonRequest({ ingredient_id: INGREDIENT_UUID }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    const row = await res.json();
    expect(row.match_status).toBe("manual");
    expect(updateRecipeIngredientAssociation).toHaveBeenCalledWith(
      "r-1",
      "ri-1",
      INGREDIENT_UUID,
    );
  });

  it("clears an association with null", async () => {
    vi.mocked(updateRecipeIngredientAssociation).mockResolvedValue(
      makeRecipeIngredient("r-1", 0, { ingredient_id: null, match_status: "unmatched" }),
    );

    const res = await PATCH(
      makeJsonRequest({ ingredient_id: null }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).match_status).toBe("unmatched");
    expect(updateRecipeIngredientAssociation).toHaveBeenCalledWith("r-1", "ri-1", null);
  });

  it("rejects a non-uuid ingredient_id with 400", async () => {
    const res = await PATCH(
      makeJsonRequest({ ingredient_id: "not-a-uuid" }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(400);
    expect(updateRecipeIngredientAssociation).not.toHaveBeenCalled();
  });

  it("rejects a body without ingredient_id with 400", async () => {
    const res = await PATCH(
      makeJsonRequest({}, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(400);
  });

  it("maps not_found to 404", async () => {
    vi.mocked(updateRecipeIngredientAssociation).mockRejectedValueOnce(
      new IngredientRepoError("not_found", "gone"),
    );

    const res = await PATCH(
      makeJsonRequest({ ingredient_id: INGREDIENT_UUID }, { method: "PATCH" }),
      makeParams("r-1", "ri-x"),
    );

    expect(res.status).toBe(404);
  });

  it("maps other repo failures to 500", async () => {
    vi.mocked(updateRecipeIngredientAssociation).mockRejectedValueOnce(
      new IngredientRepoError("update_failed", "boom"),
    );

    const res = await PATCH(
      makeJsonRequest({ ingredient_id: INGREDIENT_UUID }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(500);
  });
});
