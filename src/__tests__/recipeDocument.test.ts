import { describe, it, expect } from "vitest";
import {
  applyRecipeDocument,
  documentFromSchemaOrg,
  draftRecipeDocument,
  recipeDocument,
} from "@/lib/recipeDocument";
import { makeIngredientLines, makeRecipe } from "@/fixtures";

describe("recipeDocument", () => {
  it("lifts the row's schema, groups and time columns", () => {
    const ingredients = makeIngredientLines(["2 cups flour"]);
    const row = makeRecipe("recipe-1", "Cake", {
      ingredients,
      prep_time: 600,
      cook_time: 1800,
      total_time: null,
    });

    expect(recipeDocument(row)).toEqual({
      schema: row.metadata.schema,
      ingredients,
      prep_time: 600,
      cook_time: 1800,
      total_time: null,
    });
  });

  it("keeps the row's object identities — no copies", () => {
    const row = makeRecipe("recipe-1", "Cake", { ingredients: makeIngredientLines(["1 egg"]) });
    const doc = recipeDocument(row);
    expect(doc.schema).toBe(row.metadata.schema);
    expect(doc.ingredients).toBe(row.ingredients);
  });
});

describe("applyRecipeDocument", () => {
  it("lays the document's content over the row and keeps the row's other fields", () => {
    const row = makeRecipe("recipe-1", "Cake", {
      status: "published",
      ingredients: makeIngredientLines(["1 egg"]),
      prep_time: 600,
    });
    const doc = draftRecipeDocument(
      { name: "Saved Cake", cookTime: "PT20M" },
      [{ ingredients: [{ raw_text: "2 eggs" }] }],
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
  });

  it("round-trips with recipeDocument", () => {
    const row = makeRecipe("recipe-1", "Cake", {
      ingredients: makeIngredientLines(["1 egg"]),
      cook_time: 1800,
    });
    expect(recipeDocument(applyRecipeDocument(row, recipeDocument(row)))).toEqual(
      recipeDocument(row),
    );
  });
});

describe("draftRecipeDocument", () => {
  it("parses the schema's ISO times into column seconds and drafts the lines", () => {
    const doc = draftRecipeDocument(
      { name: "Cake", prepTime: "PT15M", totalTime: "PT1H" },
      [{ ingredients: [{ raw_text: "2 cups flour" }] }],
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
  });

  it("treats an unparseable or missing time as no time", () => {
    const doc = draftRecipeDocument({ name: "Cake", cookTime: "a while" }, []);
    expect(doc).toMatchObject({ prep_time: null, cook_time: null, total_time: null });
  });
});

describe("documentFromSchemaOrg", () => {
  it("splits recipeIngredient off the schema and groups the lines", () => {
    const doc = documentFromSchemaOrg({
      name: "Carbonara",
      cookTime: "PT20M",
      recipeIngredient: ["1 egg", { name: "50 g guanciale", group: "Sauce" }],
    });

    expect(doc.schema).toEqual({ name: "Carbonara", cookTime: "PT20M" });
    expect(doc.cook_time).toBe(1200);
    expect(doc.ingredients.map((g) => g.name)).toEqual([undefined, "Sauce"]);
    expect(doc.ingredients[1].ingredients[0].raw_text).toBe("50 g guanciale");
  });

  it("gives a recipe without recipeIngredient no groups", () => {
    expect(documentFromSchemaOrg({ name: "Water" }).ingredients).toEqual([]);
  });
});
