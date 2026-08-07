// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRecipeIngredient } from "@/fixtures";

vi.mock("@/lib/ingredients", () => ({
  getRecipeIngredients: vi.fn(),
  updateRecipeIngredientParse: vi.fn(),
}));

import { syncRecipeIngredientText } from "@/lib/normalization/syncLines";
import {
  getRecipeIngredients,
  updateRecipeIngredientParse,
} from "@/lib/ingredients";

beforeEach(() => vi.clearAllMocks());

function patchFor(rowId: string) {
  const call = vi
    .mocked(updateRecipeIngredientParse)
    .mock.calls.find(([, id]) => id === rowId);
  return call?.[2];
}

describe("syncRecipeIngredientText", () => {
  it("re-parses an edited line without touching its association", async () => {
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, {
        id: "ri-0",
        line_id: "L1",
        raw_text: "1 tsp cumin",
        quantity: 1,
        unit: "tsp",
        name_text: "cumin",
        ingredient_id: "ing-cumin",
        match_status: "manual",
      }),
    ]);

    await syncRecipeIngredientText("r-1", [
      { name: "2 tsp ground cumin", id: "L1" },
    ]);

    const patch = patchFor("ri-0");
    expect(patch).toMatchObject({
      raw_text: "2 tsp ground cumin",
      quantity: 2,
      unit: "tsp",
      name_text: "ground cumin",
      position: 0,
    });
    // The association is the user's claim about which food this is; a reword
    // is not a reason to revisit it, so it must not appear in the patch at all.
    expect(patch).not.toHaveProperty("ingredient_id");
    expect(patch).not.toHaveProperty("match_status");
  });

  it("drops a stored gram weight when the amount moves", async () => {
    // estimated_grams OVERRIDES the density-derived value, so a weight
    // measured against "2 eggs" would silently keep applying to "3 eggs".
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, {
        id: "ri-0",
        line_id: "L1",
        raw_text: "2 eggs",
        quantity: 2,
        unit: null,
        name_text: "eggs",
        estimated_grams: 100,
        grams_source: "manual",
      }),
    ]);

    await syncRecipeIngredientText("r-1", [{ name: "3 eggs", id: "L1" }]);

    expect(patchFor("ri-0")).toMatchObject({
      quantity: 3,
      estimated_grams: null,
      grams_source: null,
    });
  });

  it("keeps a stored gram weight when only the wording changes", async () => {
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, {
        id: "ri-0",
        line_id: "L1",
        raw_text: "2 eggs",
        quantity: 2,
        unit: null,
        name_text: "eggs",
        estimated_grams: 100,
        grams_source: "manual",
      }),
    ]);

    await syncRecipeIngredientText("r-1", [
      { name: "2 eggs, beaten", id: "L1" },
    ]);

    const patch = patchFor("ri-0");
    expect(patch).toMatchObject({ raw_text: "2 eggs, beaten", quantity: 2 });
    expect(patch).not.toHaveProperty("estimated_grams");
  });

  it("re-points position when lines are reordered", async () => {
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, { id: "ri-0", line_id: "L1", raw_text: "1 tsp cumin" }),
      makeRecipeIngredient("r-1", 1, { id: "ri-1", line_id: "L2", raw_text: "2 cups rice" }),
    ]);

    await syncRecipeIngredientText("r-1", [
      { name: "2 cups rice", id: "L2" },
      { name: "1 tsp cumin", id: "L1" },
    ]);

    expect(patchFor("ri-1")).toMatchObject({ position: 0 });
    expect(patchFor("ri-0")).toMatchObject({ position: 1 });
  });

  it("writes nothing when text and order are unchanged", async () => {
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, { id: "ri-0", line_id: "L1", raw_text: "1 tsp cumin" }),
    ]);

    await syncRecipeIngredientText("r-1", [{ name: "1 tsp cumin", id: "L1" }]);

    expect(updateRecipeIngredientParse).not.toHaveBeenCalled();
  });

  it("skips lines with no id and ids with no row", async () => {
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, { id: "ri-0", line_id: "L1", raw_text: "1 tsp cumin" }),
    ]);

    await syncRecipeIngredientText("r-1", [
      "3 cloves garlic", // no id — never normalized
      { name: "2 cups rice", id: "L-unknown" }, // id with no row yet
    ]);

    expect(updateRecipeIngredientParse).not.toHaveBeenCalled();
  });
});
