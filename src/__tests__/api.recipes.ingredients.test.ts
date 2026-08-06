import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/recipes/[id]/ingredients/route";
import { PATCH } from "@/app/api/recipes/[id]/ingredients/[riId]/route";
import {
  IngredientRepoError,
  getIngredientsByIds,
  getRecipeIngredientById,
  getRecipeIngredients,
  updateRecipeIngredientAssociation,
} from "@/lib/ingredients";
import {
  addAliasesAndReembed,
  removeAliasAndReembed,
} from "@/lib/ingredientAliases";
import { getRecipeById } from "@/lib/recipes";
import { getIsLoggedIn } from "@/lib/auth";
import { makeIngredient, makeRecipe, makeRecipeIngredient } from "@/fixtures";
import { makeJsonRequest } from "@/fixtures/request";

vi.mock("@/lib/ingredients", async (orig) => {
  const actual = await orig<typeof import("@/lib/ingredients")>();
  return {
    ...actual,
    getRecipeIngredients: vi.fn(),
    getRecipeIngredientById: vi.fn(),
    getIngredientsByIds: vi.fn(),
    updateRecipeIngredientAssociation: vi.fn(),
  };
});

vi.mock("@/lib/ingredientAliases", () => ({
  addAliasesAndReembed: vi.fn(),
  removeAliasAndReembed: vi.fn(),
}));

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
  const OTHER_UUID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);
    // Previously unassociated, so the default case is "add only".
    vi.mocked(getRecipeIngredientById).mockResolvedValue(
      makeRecipeIngredient("r-1", 0, {
        ingredient_id: null,
        name_text: "cumin seed",
        match_status: "unmatched",
      }),
    );
    vi.mocked(updateRecipeIngredientAssociation).mockResolvedValue(
      makeRecipeIngredient("r-1", 0, {
        ingredient_id: INGREDIENT_UUID,
        name_text: "cumin seed",
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

  describe("alias bookkeeping", () => {
    // A user moving a line off an ingredient is asserting that this wording
    // does not mean that food, so the alias is stripped unconditionally.
    // Automated re-matching never prunes — only this route does.
    function associatedWith(id: string | null, nameText = "cumin seed") {
      return makeRecipeIngredient("r-1", 0, {
        ingredient_id: id,
        name_text: nameText,
        match_status: id ? "manual" : "unmatched",
      });
    }

    it("adds the alias when a previously unmatched line gains an association", async () => {
      await PATCH(
        makeJsonRequest({ ingredient_id: INGREDIENT_UUID }, { method: "PATCH" }),
        makeParams(),
      );

      expect(addAliasesAndReembed).toHaveBeenCalledWith(INGREDIENT_UUID, [
        "cumin seed",
      ]);
      expect(removeAliasAndReembed).not.toHaveBeenCalled();
    });

    it("moves the alias from the old ingredient to the new one on a re-point", async () => {
      vi.mocked(getRecipeIngredientById).mockResolvedValue(
        associatedWith(OTHER_UUID),
      );

      await PATCH(
        makeJsonRequest({ ingredient_id: INGREDIENT_UUID }, { method: "PATCH" }),
        makeParams(),
      );

      expect(removeAliasAndReembed).toHaveBeenCalledWith(OTHER_UUID, "cumin seed");
      expect(addAliasesAndReembed).toHaveBeenCalledWith(INGREDIENT_UUID, [
        "cumin seed",
      ]);
    });

    it("strips without adding when the association is cleared", async () => {
      vi.mocked(getRecipeIngredientById).mockResolvedValue(
        associatedWith(OTHER_UUID),
      );
      vi.mocked(updateRecipeIngredientAssociation).mockResolvedValue(
        associatedWith(null),
      );

      await PATCH(
        makeJsonRequest({ ingredient_id: null }, { method: "PATCH" }),
        makeParams(),
      );

      expect(removeAliasAndReembed).toHaveBeenCalledWith(OTHER_UUID, "cumin seed");
      expect(addAliasesAndReembed).not.toHaveBeenCalled();
    });

    it("does nothing when the association is unchanged", async () => {
      // A no-op re-point must not strip-then-add: that burns two embeddings and
      // briefly leaves the ingredient without an alias it still deserves.
      vi.mocked(getRecipeIngredientById).mockResolvedValue(
        associatedWith(INGREDIENT_UUID),
      );

      await PATCH(
        makeJsonRequest({ ingredient_id: INGREDIENT_UUID }, { method: "PATCH" }),
        makeParams(),
      );

      expect(addAliasesAndReembed).not.toHaveBeenCalled();
      expect(removeAliasAndReembed).not.toHaveBeenCalled();
    });

    it("touches no aliases when the row doesn't exist", async () => {
      vi.mocked(getRecipeIngredientById).mockResolvedValue(null);

      const res = await PATCH(
        makeJsonRequest({ ingredient_id: INGREDIENT_UUID }, { method: "PATCH" }),
        makeParams("r-1", "ri-x"),
      );

      expect(res.status).toBe(404);
      expect(updateRecipeIngredientAssociation).not.toHaveBeenCalled();
      expect(addAliasesAndReembed).not.toHaveBeenCalled();
      expect(removeAliasAndReembed).not.toHaveBeenCalled();
    });

    it("leaves aliases alone when the association write fails", async () => {
      vi.mocked(updateRecipeIngredientAssociation).mockRejectedValueOnce(
        new IngredientRepoError("update_failed", "boom"),
      );

      await PATCH(
        makeJsonRequest({ ingredient_id: INGREDIENT_UUID }, { method: "PATCH" }),
        makeParams(),
      );

      expect(addAliasesAndReembed).not.toHaveBeenCalled();
      expect(removeAliasAndReembed).not.toHaveBeenCalled();
    });
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
