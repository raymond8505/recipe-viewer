// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  draftIngredientGroups,
  flattenIngredients,
  fromSchemaOrgIngredients,
  hydrateIngredientGroups,
  ingredientTexts,
  newRecipeIngredient,
  toIngredientInput,
  toRecipeIngredient,
  toStoredGroups,
} from "@/lib/recipeIngredients";
import {
  ingredientFixtures,
  makeIngredientGroup,
  makeIngredientLines,
  makeRecipeIngredient,
  makeRecipeIngredientRow,
} from "@/fixtures";

describe("newRecipeIngredient", () => {
  it("parses the text deterministically and starts unmatched", () => {
    expect(newRecipeIngredient("2 tsp cumin seed", "ri-1")).toEqual({
      id: "ri-1",
      ingredient_id: null,
      raw_text: "2 tsp cumin seed",
      quantity: 2,
      unit: "tsp",
      name_text: "cumin seed",
      note: null,
      match_status: "unmatched",
      confidence: null,
      estimated_grams: null,
      grams_source: null,
      ingredient: null,
    });
  });

  it("mints a uuid when no id is given", () => {
    expect(newRecipeIngredient("salt to taste").id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("flattenIngredients / ingredientTexts", () => {
  it("reads group by group, line by line", () => {
    const groups = [
      makeIngredientGroup("Rub", ["1 tsp cumin", "1 tsp salt"]),
      makeIngredientGroup("Base", ["2 cups rice"]),
    ];
    expect(flattenIngredients(groups).map((i) => i.id)).toEqual([
      "ri-1-tsp-cumin",
      "ri-1-tsp-salt",
      "ri-2-cups-rice",
    ]);
    expect(ingredientTexts(groups)).toEqual(["1 tsp cumin", "1 tsp salt", "2 cups rice"]);
  });
});

describe("draftIngredientGroups", () => {
  it("builds a parsed, unmatched ingredient per line and keeps a given id", () => {
    const groups = draftIngredientGroups([
      { ingredients: [{ raw_text: "1 tsp cumin", id: "ri-keep" }, { raw_text: "2 cups rice" }] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).not.toHaveProperty("name");
    expect(groups[0].ingredients[0]).toMatchObject({
      id: "ri-keep",
      raw_text: "1 tsp cumin",
      quantity: 1,
      unit: "tsp",
      match_status: "unmatched",
    });
    expect(groups[0].ingredients[1].id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("toIngredientInput / toStoredGroups", () => {
  const groups = [
    makeIngredientGroup(undefined, ["salt to taste"]),
    makeIngredientGroup("Sauce", ["2 tbsp curry paste"]),
  ];

  it("reduces each line to id + text and keeps the name key only when named", () => {
    const input = toIngredientInput(groups);
    expect(input).toEqual([
      { ingredients: [{ id: "ri-salt-to-taste", raw_text: "salt to taste" }] },
      { name: "Sauce", ingredients: [{ id: "ri-2-tbsp-curry-paste", raw_text: "2 tbsp curry paste" }] },
    ]);
    expect(input[0]).not.toHaveProperty("name");
  });

  it("stores ids only", () => {
    const stored = toStoredGroups(groups);
    expect(stored).toEqual([
      { ingredients: ["ri-salt-to-taste"] },
      { name: "Sauce", ingredients: ["ri-2-tbsp-curry-paste"] },
    ]);
    expect(stored[0]).not.toHaveProperty("name");
  });
});

describe("toRecipeIngredient", () => {
  it("drops recipe_id, and only sets ingredient when told", () => {
    const row = makeRecipeIngredientRow("r-1", 3, { id: "ri-a" });
    const bare = toRecipeIngredient(row);
    expect(bare).not.toHaveProperty("recipe_id");
    expect(bare).not.toHaveProperty("ingredient");
    expect(toRecipeIngredient(row, null).ingredient).toBeNull();
  });
});

describe("hydrateIngredientGroups", () => {
  const cumin = ingredientFixtures[0];
  const rows = [
    makeRecipeIngredientRow("r-1", 0, { id: "a", raw_text: "second" }),
    makeRecipeIngredientRow("r-1", 1, { id: "b", raw_text: "third", ingredient_id: cumin.id }),
    makeRecipeIngredientRow("r-1", 2, { id: "c", raw_text: "first" }),
  ];

  it("orders by the group array, not by the order rows came back in", () => {
    const groups = hydrateIngredientGroups([{ ingredients: ["c", "a", "b"] }], rows);
    expect(groups[0].ingredients.map((i) => i.raw_text)).toEqual(["first", "second", "third"]);
    expect(groups[0]).not.toHaveProperty("name");
  });

  it("carries the group name and leaves ingredient off when no catalog is given", () => {
    const groups = hydrateIngredientGroups(
      [{ name: "Rub", ingredients: ["b"] }],
      rows,
    );
    expect(groups[0].name).toBe("Rub");
    expect(groups[0].ingredients[0]).not.toHaveProperty("ingredient");
  });

  it("resolves the catalog row when given one, null for an unmatched line", () => {
    const groups = hydrateIngredientGroups(
      [{ ingredients: ["a", "b"] }],
      rows,
      new Map([[cumin.id, cumin]]),
    );
    expect(groups[0].ingredients[0].ingredient).toBeNull();
    expect(groups[0].ingredients[1].ingredient).toBe(cumin);
  });

  // Reachable: the write path is not transactional, so a failure between
  // writing the group array and writing the rows leaves a dangling id.
  it("skips an id no row answers to rather than throwing", () => {
    const groups = hydrateIngredientGroups([{ ingredients: ["a", "missing", "c"] }], rows);
    expect(groups[0].ingredients.map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("fromSchemaOrgIngredients", () => {
  it("collapses plain strings to one nameless group", () => {
    expect(fromSchemaOrgIngredients(["1 tsp cumin", " 2 cups rice "])).toEqual([
      { ingredients: [{ raw_text: "1 tsp cumin" }, { raw_text: "2 cups rice" }] },
    ]);
  });

  it("groups by first appearance and folds ungrouped lines into the nameless group", () => {
    expect(
      fromSchemaOrgIngredients([
        "salt",
        { name: "1 tsp cumin", group: "Rub" },
        { name: "2 cups rice", group: "Base" },
        "pepper",
        { name: "1 tsp paprika", group: "Rub" },
      ]),
    ).toEqual([
      { ingredients: [{ raw_text: "salt" }, { raw_text: "pepper" }] },
      { name: "Rub", ingredients: [{ raw_text: "1 tsp cumin" }, { raw_text: "1 tsp paprika" }] },
      { name: "Base", ingredients: [{ raw_text: "2 cups rice" }] },
    ]);
  });

  it("drops blank lines and treats a blank group as no group", () => {
    expect(
      fromSchemaOrgIngredients(["", "   ", { name: "1 egg", group: "  " }]),
    ).toEqual([{ ingredients: [{ raw_text: "1 egg" }] }]);
  });

  it("returns nothing for nothing", () => {
    expect(fromSchemaOrgIngredients([])).toEqual([]);
  });
});

describe("fixture factories", () => {
  it("makeIngredientLines builds one nameless group of parsed lines", () => {
    const [group] = makeIngredientLines(["2 cups flour", makeRecipeIngredient("1 egg", { id: "x" })]);
    expect(group).not.toHaveProperty("name");
    expect(group.ingredients.map((i) => i.id)).toEqual(["ri-2-cups-flour", "x"]);
    expect(group.ingredients[0]).toMatchObject({ quantity: 2, unit: "cup" });
  });
});
