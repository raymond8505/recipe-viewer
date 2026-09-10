// @vitest-environment node
import { describe, expect, it } from "vitest";
import { reconcileRecipeIngredients } from "@/lib/recipeIngredientReconcile";
import { makeRecipeIngredientRow } from "@/fixtures";
import type { RecipeIngredientRow } from "@/types/ingredient";
import type { RecipeIngredientGroupInput } from "@/types/recipe";

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
  return makeRecipeIngredientRow("r-1", 0, { id, raw_text, ...overrides });
}

function lines(
  ...items: Array<string | { id?: string; raw_text: string }>
): RecipeIngredientGroupInput[] {
  return [
    {
      ingredients: items.map((item) =>
        typeof item === "string" ? { raw_text: item } : item,
      ),
    },
  ];
}

describe("reconcileRecipeIngredients", () => {
  it("mints a row for every line of a brand-new recipe", () => {
    const result = reconcileRecipeIngredients(
      "r-1",
      lines("1 tsp cumin", "2 cups rice"),
      [],
      mintIds(),
    );

    expect(result.inserts).toEqual([
      expect.objectContaining({
        id: "new-0",
        recipe_id: "r-1",
        raw_text: "1 tsp cumin",
        quantity: 1,
        unit: "tsp",
        name_text: "cumin",
        match_status: "unmatched",
        ingredient_id: null,
      }),
      expect.objectContaining({ id: "new-1", raw_text: "2 cups rice" }),
    ]);
    expect(result.stored).toEqual([{ ingredients: ["new-0", "new-1"] }]);
    expect(result.rows).toEqual(result.inserts);
    expect(result.updates).toEqual([]);
    expect(result.deleteIds).toEqual([]);
    expect(result.lineSetChanged).toBe(true);
  });

  it("leaves an untouched line completely alone", () => {
    const cumin = row("ri-0", "1 tsp cumin");
    const result = reconcileRecipeIngredients(
      "r-1",
      lines({ id: "ri-0", raw_text: "1 tsp cumin" }),
      [cumin],
      mintIds(),
    );

    expect(result).toMatchObject({
      inserts: [],
      updates: [],
      deleteIds: [],
      lineSetChanged: false,
    });
    expect(result.stored).toEqual([{ ingredients: ["ri-0"] }]);
    expect(result.rows).toEqual([cumin]);
  });

  // Reordering is the whole reason identity is the row rather than the index:
  // nothing about either row changes, only where its id sits in the array.
  it("treats a reorder as a group-array change and nothing else", () => {
    const cumin = row("ri-0", "1 tsp cumin");
    const rice = row("ri-1", "2 cups rice");
    const result = reconcileRecipeIngredients(
      "r-1",
      lines({ id: "ri-1", raw_text: "2 cups rice" }, { id: "ri-0", raw_text: "1 tsp cumin" }),
      [cumin, rice],
      mintIds(),
    );

    expect(result.stored).toEqual([{ ingredients: ["ri-1", "ri-0"] }]);
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
      "r-1",
      lines({ id: "ri-0", raw_text: "2 tsp ground cumin" }),
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
    expect(result.rows).toEqual(result.updates);
    expect(result.lineSetChanged).toBe(false);
  });

  // A stored gram weight describes one specific amount, and it OVERRIDES the
  // density-derived value — left in place across an amount change, it wins
  // silently.
  it("drops a gram estimate when the amount moves", () => {
    const cumin = row("ri-0", "1 tsp cumin", {
      estimated_grams: 6,
      grams_source: "manual",
    });
    const result = reconcileRecipeIngredients(
      "r-1",
      lines({ id: "ri-0", raw_text: "3 tsp cumin" }),
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
      "r-1",
      lines({ id: "ri-0", raw_text: "1 tsp ground cumin" }),
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
      "r-1",
      lines({ id: "ri-0", raw_text: "1 tsp cumin" }),
      [cumin, rice],
      mintIds(),
    );

    expect(result.deleteIds).toEqual(["ri-1"]);
    expect(result.lineSetChanged).toBe(true);
    expect(result.stored).toEqual([{ ingredients: ["ri-0"] }]);
  });

  // A re-scrape or an MCP create_recipe hands over bare text. Recreating every
  // row there would drop every association a user curated, so a line with no
  // usable id claims the row that says the same thing.
  it("carries an id-less line over to an unclaimed row with the same text", () => {
    const cumin = row("ri-0", "1 tsp cumin", { ingredient_id: "ing-cumin", match_status: "manual" });
    const result = reconcileRecipeIngredients(
      "r-1",
      lines("1 tsp cumin", "2 cups rice"),
      [cumin],
      mintIds(),
    );

    expect(result.stored).toEqual([{ ingredients: ["ri-0", "new-0"] }]);
    expect(result.updates).toEqual([]);
    expect(result.deleteIds).toEqual([]);
    expect(result.inserts.map((r) => r.raw_text)).toEqual(["2 cups rice"]);
  });

  it("treats an unknown id like no id: text first, then a fresh row", () => {
    const cumin = row("ri-0", "1 tsp cumin");
    const byText = reconcileRecipeIngredients(
      "r-1",
      lines({ id: "ri-gone", raw_text: "1 tsp cumin" }),
      [cumin],
      mintIds(),
    );
    expect(byText.stored).toEqual([{ ingredients: ["ri-0"] }]);
    expect(byText.inserts).toEqual([]);

    const fresh = reconcileRecipeIngredients(
      "r-1",
      lines({ id: "ri-gone", raw_text: "1 tsp coriander" }),
      [cumin],
      mintIds(),
    );
    expect(fresh.inserts[0].id).toBe("new-0");
    expect(fresh.deleteIds).toEqual(["ri-0"]);
  });

  it("never hands one row to two lines", () => {
    const cumin = row("ri-0", "1 tsp cumin");
    const result = reconcileRecipeIngredients(
      "r-1",
      lines({ id: "ri-0", raw_text: "1 tsp cumin" }, { id: "ri-0", raw_text: "1 tsp cumin" }),
      [cumin],
      mintIds(),
    );

    expect(result.stored).toEqual([{ ingredients: ["ri-0", "new-0"] }]);
  });

  it("carries repeated identical lines over positionally", () => {
    const first = row("ri-0", "1 egg", { ingredient_id: "ing-egg" });
    const second = row("ri-1", "1 egg");
    const result = reconcileRecipeIngredients(
      "r-1",
      lines("1 egg", "1 egg"),
      [first, second],
      mintIds(),
    );

    expect(result.stored).toEqual([{ ingredients: ["ri-0", "ri-1"] }]);
    expect(result.inserts).toEqual([]);
  });

  // The id wins over text: a line keeping its row by id must not lose it to
  // an id-less line ahead of it that happens to say the same thing.
  it("reserves a row for the line that names it before text fallback runs", () => {
    const cumin = row("ri-0", "1 tsp cumin", { ingredient_id: "ing-cumin" });
    const result = reconcileRecipeIngredients(
      "r-1",
      lines("1 tsp cumin", { id: "ri-0", raw_text: "1 tsp cumin" }),
      [cumin],
      mintIds(),
    );

    expect(result.stored).toEqual([{ ingredients: ["new-0", "ri-0"] }]);
  });

  it("keeps groups, drops empty ones, and treats a blank name as no name", () => {
    const result = reconcileRecipeIngredients(
      "r-1",
      [
        { name: "Rub", ingredients: [{ raw_text: "1 tsp cumin" }, { raw_text: "   " }] },
        { name: "Empty", ingredients: [{ raw_text: "" }] },
        { name: "  ", ingredients: [{ raw_text: "2 cups rice" }] },
      ],
      [],
      mintIds(),
    );

    expect(result.stored).toEqual([
      { name: "Rub", ingredients: ["new-0"] },
      { ingredients: ["new-1"] },
    ]);
    expect(result.stored[1]).not.toHaveProperty("name");
  });

  it("clears the column when every line is removed", () => {
    const result = reconcileRecipeIngredients("r-1", [], [row("ri-0", "1 tsp cumin")], mintIds());

    expect(result.stored).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.deleteIds).toEqual(["ri-0"]);
  });
});
