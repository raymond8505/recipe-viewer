// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRecipeIngredient } from "@/fixtures";

vi.mock("@/lib/ingredients", () => ({
  getRecipeIngredients: vi.fn(),
  updateRecipeIngredientRows: vi.fn(),
}));

import { syncRecipeIngredientText } from "@/lib/normalization/syncLines";
import {
  getRecipeIngredients,
  updateRecipeIngredientRows,
} from "@/lib/ingredients";

beforeEach(() => vi.clearAllMocks());

function written() {
  return vi.mocked(updateRecipeIngredientRows).mock.calls[0]?.[1] ?? [];
}

function patchFor(rowId: string) {
  return written().find((row) => row.id === rowId);
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
    // is not a reason to revisit it, so it rides through untouched.
    expect(patch).toMatchObject({
      ingredient_id: "ing-cumin",
      match_status: "manual",
    });
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

    expect(patchFor("ri-0")).toMatchObject({
      raw_text: "2 eggs, beaten",
      quantity: 2,
      estimated_grams: 100,
      grams_source: "manual",
    });
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
    // Both halves of the swap must go in ONE call. unique (recipe_id,
    // position) is only INITIALLY DEFERRED, so split across statements the
    // first update would collide with the row that hasn't moved yet.
    expect(updateRecipeIngredientRows).toHaveBeenCalledTimes(1);
    expect(written()).toHaveLength(2);
  });

  it("writes nothing when text and order are unchanged", async () => {
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, { id: "ri-0", line_id: "L1", raw_text: "1 tsp cumin" }),
    ]);

    await syncRecipeIngredientText("r-1", [{ name: "1 tsp cumin", id: "L1" }]);

    expect(written()).toEqual([]);
  });

  // A row written before line ids existed is reachable only by position. The
  // first save of that recipe mints an id for the line, and this is the one
  // chance to key the row to it — miss it and the line joins by an id no row
  // carries, which reads as "never normalized" forever.
  it("stamps a freshly minted id onto the legacy row at that position", async () => {
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, {
        id: "ri-0",
        line_id: null,
        raw_text: "1 tsp cumin",
        quantity: 1,
        unit: "tsp",
        name_text: "cumin",
        ingredient_id: "ing-cumin",
        match_status: "matched",
        estimated_grams: 2,
        grams_source: "llm",
      }),
    ]);

    await syncRecipeIngredientText("r-1", [
      { name: "1 tsp ground cumin", id: "U1" },
    ]);

    expect(patchFor("ri-0")).toMatchObject({
      line_id: "U1",
      raw_text: "1 tsp ground cumin",
      name_text: "ground cumin",
      // Stamping is bookkeeping — the curated association and its weight are
      // no more up for revision here than on any other reword.
      ingredient_id: "ing-cumin",
      estimated_grams: 2,
    });
  });

  // Stamping is the whole reason to write when nothing else moved.
  it("stamps a legacy row even when the text is unchanged", async () => {
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, {
        id: "ri-0",
        line_id: null,
        raw_text: "1 tsp cumin",
        quantity: 1,
        unit: "tsp",
        name_text: "cumin",
      }),
    ]);

    await syncRecipeIngredientText("r-1", [{ name: "1 tsp cumin", id: "U1" }]);

    expect(written()).toHaveLength(1);
    expect(patchFor("ri-0")).toMatchObject({ line_id: "U1" });
  });

  // The stored parse came from the model; the deterministic parser is a
  // fallback. Re-reading unchanged words through it can only lose information
  // — and a quantity/unit disagreement would take the gram weight with it.
  it("does not re-parse a stamped row whose text never moved", async () => {
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, {
        id: "ri-0",
        line_id: null,
        raw_text: "a good handful of parsley",
        quantity: 1,
        unit: "handful",
        name_text: "parsley",
        estimated_grams: 15,
        grams_source: "manual",
      }),
    ]);

    await syncRecipeIngredientText("r-1", [
      { name: "a good handful of parsley", id: "U1" },
    ]);

    expect(patchFor("ri-0")).toMatchObject({
      line_id: "U1",
      position: 0,
      quantity: 1,
      unit: "handful",
      name_text: "parsley",
      estimated_grams: 15,
      grams_source: "manual",
    });
  });

  it("skips lines with no id and ids with no row", async () => {
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, { id: "ri-0", line_id: "L1", raw_text: "1 tsp cumin" }),
    ]);

    await syncRecipeIngredientText("r-1", [
      "3 cloves garlic", // no id — never normalized
      { name: "2 cups rice", id: "L-unknown" }, // id with no row yet
    ]);

    expect(written()).toEqual([]);
  });
});
