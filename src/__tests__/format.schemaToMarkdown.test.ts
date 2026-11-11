import { describe, it, expect } from "vitest";
import { recipeToMarkdown } from "@/lib/format";
import {
  makeIngredientGroup,
  makeIngredientLines,
  makeInstructionGroup,
  makeScalableDocument,
  makeSteps,
  weighedYieldColumns,
} from "@/fixtures";
import type { RecipeDocument, SchemaRecipe } from "@/types/recipe";

/** A named document with no lines, no steps, no times and no serving count. */
function doc(
  name: string,
  overrides: Partial<RecipeDocument> = {},
): RecipeDocument {
  return makeScalableDocument({
    name,
    ingredients: [],
    servings_amount: null,
    servings_unit: null,
    ...overrides,
  });
}

describe("recipeToMarkdown", () => {
  it("renders a minimal name-only recipe as a single heading", () => {
    expect(recipeToMarkdown(doc("Toast"))).toBe("# Toast");
  });

  it("includes the description and a metadata line", () => {
    const md = recipeToMarkdown(
      doc("Stew", {
        description: "A hearty stew.",
        schema: { recipeCuisine: "Irish" },
        total_time: 3600,
        servings_amount: 4,
        servings_unit: "servings",
      }),
    );
    expect(md).toContain("# Stew");
    expect(md).toContain("A hearty stew.");
    expect(md).toContain("Yield: 4 servings");
    expect(md).toContain("Total: 1 hr");
    expect(md).toContain("Cuisine: Irish");
  });

  it("reads a time from its column, not a copy the blob still carries", () => {
    // The markdown feeds the search embedding, so a stale blob time leaking in
    // here would make a recipe findable by a duration it does not have.
    const md = recipeToMarkdown(
      doc("Stew", {
        schema: { cookTime: "PT3H" } as unknown as SchemaRecipe,
        cook_time: 1800,
      }),
    );
    expect(md).toContain("Cook: 30 min");
    expect(md).not.toContain("3 hr");
  });

  it("renders the yield from the servings columns, unit and all", () => {
    const md = recipeToMarkdown(doc("Kebabs", weighedYieldColumns));
    expect(md).toContain("Yield: 4 kebabs");
  });

  it("omits the yield line when the recipe has no serving count", () => {
    expect(recipeToMarkdown(doc("Toast"))).not.toContain("Yield:");
  });

  it("renders ungrouped ingredients as a flat bulleted list", () => {
    const md = recipeToMarkdown(
      doc("Salad", {
        ingredients: makeIngredientLines(["1 head lettuce", "2 tomatoes"]),
      }),
    );
    expect(md).toContain("## Ingredients");
    expect(md).toContain("- 1 head lettuce");
    expect(md).toContain("- 2 tomatoes");
    expect(md).not.toContain("###");
  });

  it("renders grouped ingredients under group subheadings", () => {
    const md = recipeToMarkdown(
      doc("Cake", {
        ingredients: [
          makeIngredientGroup("Cake", ["2 cups flour", "1 cup sugar"]),
          makeIngredientGroup("Frosting", ["1 cup butter"]),
        ],
      }),
    );
    expect(md).toContain("### Cake");
    expect(md).toContain("- 2 cups flour");
    expect(md).toContain("### Frosting");
    expect(md).toContain("- 1 cup butter");
  });

  it("omits the ingredients section when every group is empty", () => {
    expect(
      recipeToMarkdown(doc("Air", { ingredients: [{ ingredients: [] }] })),
    ).toBe("# Air");
  });

  it("renders a nameless run of steps as a flat list and a named group under its heading", () => {
    const flat = recipeToMarkdown(
      doc("Quick", { instructions: makeSteps(["Mix."]) }),
    );
    expect(flat).toContain("## Instructions");
    expect(flat).toContain("- Mix.");

    const sectioned = recipeToMarkdown(
      doc("Layered", {
        instructions: [
          makeInstructionGroup(undefined, ["Preheat."]),
          makeInstructionGroup("Prep", ["Chop onions."]),
        ],
      }),
    );
    expect(sectioned).toBe(
      "# Layered\n\n## Instructions\n- Preheat.\n\n## Prep\n- Chop onions.",
    );
  });

  it("omits the instructions section when every group is empty", () => {
    expect(
      recipeToMarkdown(doc("Air", { instructions: [{ steps: [] }] })),
    ).toBe("# Air");
  });
});
