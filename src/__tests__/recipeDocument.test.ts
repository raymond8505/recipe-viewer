import { describe, it, expect } from "vitest";
import {
  applyRecipeDocument,
  draftRecipeDocument,
  recipeDocument,
} from "@/lib/recipeDocument";
import {
  makeIngredientLines,
  makeInstructionGroup,
  makeRecipe,
  makeStep,
  makeSteps,
  weighedYieldColumns,
} from "@/fixtures";

describe("recipeDocument", () => {
  it("lifts the row's schema, groups, steps and every column", () => {
    const ingredients = makeIngredientLines(["2 cups flour"]);
    const instructions = makeSteps(["Mix."]);
    const row = makeRecipe("recipe-1", "Cake", {
      ingredients,
      instructions,
      prep_time: 600,
      cook_time: 1800,
      total_time: null,
      ...weighedYieldColumns,
    });

    expect(recipeDocument(row)).toEqual({
      schema: row.metadata.schema,
      ingredients,
      instructions,
      prep_time: 600,
      cook_time: 1800,
      total_time: null,
      servings_amount: 4,
      servings_unit: "kebabs",
      total_weight_amount: 454,
      total_weight_unit: "g",
    });
  });

  it("keeps the row's object identities — no copies", () => {
    const row = makeRecipe("recipe-1", "Cake", {
      ingredients: makeIngredientLines(["1 egg"]),
      instructions: makeSteps(["Beat."]),
    });
    const doc = recipeDocument(row);
    expect(doc.schema).toBe(row.metadata.schema);
    expect(doc.ingredients).toBe(row.ingredients);
    expect(doc.instructions).toBe(row.instructions);
  });
});

describe("applyRecipeDocument", () => {
  it("lays the document's content over the row and keeps the row's other fields", () => {
    const row = makeRecipe("recipe-1", "Cake", {
      status: "published",
      ingredients: makeIngredientLines(["1 egg"]),
      instructions: makeSteps(["Whisk."]),
      prep_time: 600,
    });
    const doc = draftRecipeDocument(
      { name: "Saved Cake", cookTime: "PT20M" },
      [{ ingredients: [{ raw_text: "2 eggs" }] }],
      makeSteps(["Bake."]),
    );

    const applied = applyRecipeDocument(row, doc);

    expect(applied).toMatchObject({
      id: "recipe-1",
      status: "published",
      url: row.url,
      prep_time: null,
      cook_time: 1200,
      total_time: null,
    });
    expect(applied.metadata.schema).toBe(doc.schema);
    expect(applied.ingredients).toBe(doc.ingredients);
    // Every column-backed field comes from the document, instructions included
    // — the row's own steps are the pre-edit ones and must not survive.
    expect(applied.instructions).toBe(doc.instructions);
  });

  it("round-trips with recipeDocument", () => {
    const row = makeRecipe("recipe-1", "Cake", {
      ingredients: makeIngredientLines(["1 egg"]),
      instructions: makeSteps(["Beat."]),
      cook_time: 1800,
    });
    expect(recipeDocument(applyRecipeDocument(row, recipeDocument(row)))).toEqual(
      recipeDocument(row),
    );
  });
});

describe("draftRecipeDocument", () => {
  it("parses the schema's ISO times into column seconds, drafts the lines and takes the steps as given", () => {
    const instructions = [makeInstructionGroup("Bake", [makeStep("Bake.", { name: "Bake", seconds: 1800 })])];
    const doc = draftRecipeDocument(
      { name: "Cake", prepTime: "PT15M", totalTime: "PT1H" },
      [{ ingredients: [{ raw_text: "2 cups flour" }] }],
      instructions,
    );

    expect(doc).toMatchObject({ prep_time: 900, cook_time: null, total_time: 3600 });
    expect(doc.schema).toEqual({ name: "Cake", prepTime: "PT15M", totalTime: "PT1H" });
    expect(doc.ingredients).toHaveLength(1);
    expect(doc.ingredients[0].ingredients[0]).toMatchObject({
      raw_text: "2 cups flour",
      quantity: 2,
      unit: "cup",
      match_status: "unmatched",
    });
    expect(doc.ingredients[0].ingredients[0].id).toBeTruthy();
    expect(doc.instructions).toEqual(instructions);
  });

  it("treats an unparseable or missing time as no time", () => {
    const doc = draftRecipeDocument({ name: "Cake", cookTime: "a while" }, [], []);
    expect(doc).toMatchObject({ prep_time: null, cook_time: null, total_time: null });
  });
});
