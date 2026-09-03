import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH as PATCH_LINE } from "@/app/api/recipes/[id]/ingredients/route";
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
import { RecipeRepoError, getRecipeById, updateRecipeRow } from "@/lib/recipes";
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
  return { ...actual, getRecipeById: vi.fn(), updateRecipeRow: vi.fn() };
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

describe("PATCH /api/recipes/[id]/ingredients (line text)", () => {
  const makeParams = (id = "r-1") => ({ params: Promise.resolve({ id }) });
  const lines = [
    { name: "100 g butter", group: "Cake" },
    "5 g magic dust",
  ];

  function recipeWithLines() {
    return makeRecipe("r-1", "Test Recipe", { schema: { recipeIngredient: lines } });
  }

  // The route composes its lines from the recipe's rows, so every line it sees
  // carries the id of the row it is (db/migrations/0016). Row ids come from the
  // shared factory.
  const ROW_IDS = recipeWithLines().ingredientRows.map((row) => row.id);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);
    vi.mocked(getRecipeById).mockResolvedValue(recipeWithLines());
    vi.mocked(getRecipeIngredients).mockResolvedValue([]);
    vi.mocked(updateRecipeRow).mockImplementation(async (id, patch) =>
      makeRecipe(id, "Test Recipe", {
        schema: { recipeIngredient: patch.schema?.recipeIngredient },
      }),
    );
  });

  it("replaces a string line and returns the updated array", async () => {
    const res = await PATCH_LINE(
      makeJsonRequest({ index: 1, text: "6 g magic dust" }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).recipeIngredient).toEqual([
      { name: "100 g butter", group: "Cake", id: ROW_IDS[0] },
      { name: "6 g magic dust", id: ROW_IDS[1] },
    ]);
    // The edited line keeps its row id, so the write re-points that row rather
    // than replacing it and dropping whatever was curated on it.
    expect(updateRecipeRow).toHaveBeenCalledWith("r-1", {
      schema: {
        recipeIngredient: [
          { name: "100 g butter", group: "Cake", id: ROW_IDS[0] },
          { name: "6 g magic dust", id: ROW_IDS[1] },
        ],
      },
    });
  });

  // updateRecipeRow re-parses the derived rows in-band (no matcher run), so
  // they are already current here. Sending them back is what lets the client
  // show the edited line still carrying its match instead of blanking it.
  it("returns the re-parsed rows alongside the lines", async () => {
    const rows = [
      makeRecipeIngredient("r-1", 1, {
        id: ROW_IDS[1],
        raw_text: "6 g magic dust",
        ingredient_id: "ing-dust",
      }),
    ];
    vi.mocked(getRecipeIngredients).mockResolvedValue(rows);

    const res = await PATCH_LINE(
      makeJsonRequest({ index: 1, text: "6 g magic dust" }, { method: "PATCH" }),
      makeParams(),
    );

    expect((await res.json()).rows).toEqual(rows);
    // Read AFTER the write, or the response carries the pre-edit rows.
    expect(getRecipeIngredients).toHaveBeenCalledWith("r-1");
    expect(vi.mocked(updateRecipeRow).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getRecipeIngredients).mock.invocationCallOrder[0],
    );
  });

  it("edits an object line's name while preserving its group", async () => {
    const res = await PATCH_LINE(
      makeJsonRequest({ index: 0, text: "150 g butter" }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).recipeIngredient[0]).toEqual({
      name: "150 g butter",
      group: "Cake",
      id: ROW_IDS[0],
    });
  });

  it("rejects an out-of-range index with 400", async () => {
    const res = await PATCH_LINE(
      makeJsonRequest({ index: 2, text: "anything" }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(400);
    expect(updateRecipeRow).not.toHaveBeenCalled();
  });

  it("rejects blank text with 400", async () => {
    const res = await PATCH_LINE(
      makeJsonRequest({ index: 0, text: "   " }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(400);
    expect(updateRecipeRow).not.toHaveBeenCalled();
  });

  it("404s for an unknown recipe", async () => {
    vi.mocked(getRecipeById).mockResolvedValue(null);

    const res = await PATCH_LINE(
      makeJsonRequest({ index: 0, text: "150 g butter" }, { method: "PATCH" }),
      makeParams("nope"),
    );

    expect(res.status).toBe(404);
  });

  it("maps repo failures to 500", async () => {
    vi.mocked(updateRecipeRow).mockRejectedValueOnce(
      new RecipeRepoError("update_failed", "boom"),
    );

    const res = await PATCH_LINE(
      makeJsonRequest({ index: 0, text: "150 g butter" }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(500);
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
