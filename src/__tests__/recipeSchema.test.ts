// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  composeRecipeIngredient,
  composeRecipeSchema,
  toIngredientGroups,
} from "@/lib/recipeSchema";
import { groupIngredientsWithIndex } from "@/lib/format";
import type { RecipeIngredientRow } from "@/types/ingredient";

function row(id: string, raw_text: string): Pick<RecipeIngredientRow, "id" | "raw_text"> {
  return { id, raw_text };
}

describe("composeRecipeIngredient", () => {
  it("flattens groups in order, carrying the group name onto each line", () => {
    const lines = composeRecipeIngredient(
      [
        { name: "Meatballs", ingredients: ["a", "b"] },
        { name: "Sauce", ingredients: ["c"] },
      ],
      [row("a", "1 lb ground chicken"), row("b", "1 egg"), row("c", "2 tbsp curry paste")],
    );

    expect(lines).toEqual([
      { name: "1 lb ground chicken", group: "Meatballs", id: "a" },
      { name: "1 egg", group: "Meatballs", id: "b" },
      { name: "2 tbsp curry paste", group: "Sauce", id: "c" },
    ]);
  });

  it("omits group entirely for an unnamed group", () => {
    const lines = composeRecipeIngredient(
      [{ ingredients: ["a"] }],
      [row("a", "1 tsp salt")],
    );

    expect(lines).toEqual([{ name: "1 tsp salt", id: "a" }]);
    expect(lines[0]).not.toHaveProperty("group");
  });

  it("orders by the group array, not by the order rows came back in", () => {
    const lines = composeRecipeIngredient(
      [{ ingredients: ["c", "a", "b"] }],
      [row("a", "second"), row("b", "third"), row("c", "first")],
    );

    expect(lines.map((l) => l.name)).toEqual(["first", "second", "third"]);
  });

  it("skips an id no row answers to rather than throwing", () => {
    // Reachable: the write path is not transactional, so a failure between
    // writing the group array and writing the rows leaves a dangling id.
    const lines = composeRecipeIngredient(
      [{ ingredients: ["a", "missing", "b"] }],
      [row("a", "1 tsp salt"), row("b", "1 tsp pepper")],
    );

    expect(lines.map((l) => l.name)).toEqual(["1 tsp salt", "1 tsp pepper"]);
  });

  it("returns an empty list for a recipe with no groups", () => {
    expect(composeRecipeIngredient([], [row("a", "orphan")])).toEqual([]);
  });
});

describe("composeRecipeSchema", () => {
  it("puts both columns back onto the stored schema", () => {
    const schema = composeRecipeSchema({
      metadata: { schema: { name: "Curry", recipeYield: "4 servings" } },
      ingredients: [{ ingredients: ["a"] }],
      instructions: [{ "@type": "HowToStep", text: "Cook it." }],
      ingredientRows: [row("a", "1 tsp salt")] as RecipeIngredientRow[],
    });

    expect(schema).toEqual({
      name: "Curry",
      recipeYield: "4 servings",
      recipeIngredient: [{ name: "1 tsp salt", id: "a" }],
      recipeInstructions: [{ "@type": "HowToStep", text: "Cook it." }],
    });
  });

  it("returns a fresh object each call", () => {
    // Load-bearing for RecipeDetail/CookingMode, which memoize one instance and
    // compare by reference — a shared object would make that check meaningless
    // in the other direction.
    const row0 = {
      metadata: { schema: { name: "Curry" } },
      ingredients: [],
      instructions: [],
      ingredientRows: [],
    };

    expect(composeRecipeSchema(row0)).not.toBe(composeRecipeSchema(row0));
  });
});

describe("toIngredientGroups", () => {
  it("round-trips with composeRecipeIngredient", () => {
    const groups = [
      { name: "Meatballs", ingredients: ["a", "b"] },
      { name: "Sauce", ingredients: ["c"] },
    ];
    const rows = [row("a", "chicken"), row("b", "egg"), row("c", "paste")];

    expect(toIngredientGroups(composeRecipeIngredient(groups, rows))).toEqual(groups);
  });

  it("collapses an ungrouped list to one group with no name", () => {
    const groups = toIngredientGroups([
      { name: "salt", id: "a" },
      { name: "pepper", id: "b" },
    ]);

    expect(groups).toEqual([{ ingredients: ["a", "b"] }]);
    expect(groups[0]).not.toHaveProperty("name");
  });

  it("emits groups in first-appearance order", () => {
    const groups = toIngredientGroups([
      { group: "B", id: "1" },
      { group: "A", id: "2" },
      { group: "B", id: "3" },
    ]);

    expect(groups).toEqual([
      { name: "B", ingredients: ["1", "3"] },
      { name: "A", ingredients: ["2"] },
    ]);
  });

  it("groups exactly as the renderer does", () => {
    // If these two disagreed, saving would reorder the list the user was just
    // looking at. groupIngredientsWithIndex is what RecipeDetail renders from.
    const lines = [
      { name: "chicken", group: "Meatballs", id: "a" },
      { name: "paste", group: "Sauce", id: "b" },
      { name: "egg", group: "Meatballs", id: "c" },
    ];

    expect(toIngredientGroups(lines)).toEqual(
      groupIngredientsWithIndex(lines).map(({ heading, items }) => {
        const ingredients = items.map((i) => (i.ingredient as { id: string }).id);
        return heading == null ? { ingredients } : { name: heading, ingredients };
      }),
    );
  });

  it("returns an empty array for no lines", () => {
    expect(toIngredientGroups([])).toEqual([]);
  });
});
