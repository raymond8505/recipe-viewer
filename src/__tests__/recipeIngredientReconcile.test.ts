// @vitest-environment node
import { describe, expect, it } from "vitest";
import { reconcileRecipeIngredients } from "@/lib/recipeIngredientReconcile";
import { makeRecipeIngredient } from "@/fixtures";
import type { RecipeIngredientRow } from "@/types/ingredient";

// Deterministic ids so a reconcile's output can be asserted exactly.
function mintIds() {
  let n = 0;
  return () => `new-${n++}`;
}

function row(
  id: string,
  raw_text: string,
  overrides: Partial<RecipeIngredientRow> = {},
): RecipeIngredientRow {
  return makeRecipeIngredient("r-1", 0, { id, raw_text, ...overrides });
}

describe("reconcileRecipeIngredients", () => {
  it("mints a row for every line of a brand-new recipe", () => {
    const result = reconcileRecipeIngredients(
      ["1 tsp cumin", "2 cups rice"],
      [],
      mintIds(),
    );

    expect(result.inserts).toEqual([
      expect.objectContaining({
        id: "new-0",
        raw_text: "1 tsp cumin",
        quantity: 1,
        unit: "tsp",
        name_text: "cumin",
        match_status: "unmatched",
        ingredient_id: null,
      }),
      expect.objectContaining({ id: "new-1", raw_text: "2 cups rice" }),
    ]);
    expect(result.groups).toEqual([{ ingredients: ["new-0", "new-1"] }]);
    expect(result.updates).toEqual([]);
    expect(result.deleteIds).toEqual([]);
    expect(result.lineSetChanged).toBe(true);
  });

  it("leaves an untouched line completely alone", () => {
    const cumin = row("ri-0", "1 tsp cumin");
    const result = reconcileRecipeIngredients(
      [{ name: "1 tsp cumin", id: "ri-0" }],
      [cumin],
      mintIds(),
    );

    expect(result).toMatchObject({
      inserts: [],
      updates: [],
      deleteIds: [],
      lineSetChanged: false,
    });
    expect(result.groups).toEqual([{ ingredients: ["ri-0"] }]);
  });

  // Reordering is the whole reason identity is the row rather than the index:
  // nothing about either row changes, only where its id sits in the array.
  it("treats a reorder as a group-array change and nothing else", () => {
    const cumin = row("ri-0", "1 tsp cumin");
    const rice = row("ri-1", "2 cups rice");
    const result = reconcileRecipeIngredients(
      [
        { name: "2 cups rice", id: "ri-1" },
        { name: "1 tsp cumin", id: "ri-0" },
      ],
      [cumin, rice],
      mintIds(),
    );

    expect(result.groups).toEqual([{ ingredients: ["ri-1", "ri-0"] }]);
    expect(result).toMatchObject({
      inserts: [],
      updates: [],
      deleteIds: [],
      lineSetChanged: false,
    });
  });

  it("re-parses a reworded line without disturbing its association", () => {
    const cumin = row("ri-0", "1 tsp cumin", {
      ingredient_id: "ing-cumin",
      match_status: "manual",
      confidence: 0.9,
    });
    const result = reconcileRecipeIngredients(
      [{ name: "2 tsp ground cumin", id: "ri-0" }],
      [cumin],
      mintIds(),
    );

    expect(result.updates).toEqual([
      expect.objectContaining({
        id: "ri-0",
        raw_text: "2 tsp ground cumin",
        quantity: 2,
        unit: "tsp",
        name_text: "ground cumin",
        ingredient_id: "ing-cumin",
        match_status: "manual",
        confidence: 0.9,
      }),
    ]);
    expect(result.lineSetChanged).toBe(false);
  });

  // A stored gram weight was measured against the old amount, and it OVERRIDES
  // the density-derived value — a stale one would win silently.
  it("drops a gram estimate when the amount moves", () => {
    const cumin = row("ri-0", "1 tsp cumin", {
      estimated_grams: 6,
      grams_source: "manual",
    });
    const result = reconcileRecipeIngredients(
      [{ name: "3 tsp cumin", id: "ri-0" }],
      [cumin],
      mintIds(),
    );

    expect(result.updates[0]).toMatchObject({
      estimated_grams: null,
      grams_source: null,
    });
  });

  it("keeps a gram estimate when only the wording moves", () => {
    const cumin = row("ri-0", "1 tsp cumin", {
      estimated_grams: 6,
      grams_source: "manual",
    });
    const result = reconcileRecipeIngredients(
      [{ name: "1 tsp ground cumin", id: "ri-0" }],
      [cumin],
      mintIds(),
    );

    expect(result.updates[0]).toMatchObject({
      estimated_grams: 6,
      grams_source: "manual",
    });
  });

  it("reports removed lines for pruning and flags the set as changed", () => {
    const cumin = row("ri-0", "1 tsp cumin");
    const rice = row("ri-1", "2 cups rice");
    const result = reconcileRecipeIngredients(
      [{ name: "1 tsp cumin", id: "ri-0" }],
      [cumin, rice],
      mintIds(),
    );

    expect(result.deleteIds).toEqual(["ri-1"]);
    expect(result.lineSetChanged).toBe(true);
    expect(result.groups).toEqual([{ ingredients: ["ri-0"] }]);
  });

  // A caller that round-trips a recipe hands ids back; an MCP update_recipe or
  // a re-scrape may send bare strings, and each of those is a new line.
  it("treats a line whose id names no row as new", () => {
    const cumin = row("ri-0", "1 tsp cumin");
    const result = reconcileRecipeIngredients(
      [{ name: "1 tsp cumin", id: "ri-gone" }],
      [cumin],
      mintIds(),
    );

    expect(result.inserts).toHaveLength(1);
    expect(result.inserts[0].id).toBe("new-0");
    expect(result.deleteIds).toEqual(["ri-0"]);
  });

  it("builds one group per heading, in first-appearance order", () => {
    const result = reconcileRecipeIngredients(
      [
        { name: "1 tsp cumin", group: "Rub" },
        { name: "2 cups rice", group: "Base" },
        { name: "1 tsp salt", group: "Rub" },
      ],
      [],
      mintIds(),
    );

    expect(result.groups).toEqual([
      { name: "Rub", ingredients: ["new-0", "new-2"] },
      { name: "Base", ingredients: ["new-1"] },
    ]);
  });

  it("clears the group array when every line is removed", () => {
    const result = reconcileRecipeIngredients([], [row("ri-0", "1 tsp cumin")], mintIds());

    expect(result.groups).toEqual([]);
    expect(result.deleteIds).toEqual(["ri-0"]);
  });
});
