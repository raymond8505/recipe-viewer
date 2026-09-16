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

/** A document with no lines, no steps, no times and no serving count. */
function doc(
  schema: SchemaRecipe,
  overrides: Partial<RecipeDocument> = {},
): RecipeDocument {
  return makeScalableDocument({
    schema,
    ingredients: [],
    servings_amount: null,
    servings_unit: null,
    ...overrides,
  });
}

describe("recipeToMarkdown", () => {
  it("renders a minimal name-only recipe as a single heading", () => {
    expect(recipeToMarkdown(doc({ name: "Toast" }))).toBe("# Toast");
  });

  it("includes the description and a metadata line", () => {
    const md = recipeToMarkdown(
      doc(
        {
          name: "Stew",
          description: "A hearty stew.",
          totalTime: "PT1H",
          recipeCuisine: "Irish",
        },
        { servings_amount: 4, servings_unit: "servings" },
      ),
    );
    expect(md).toContain("# Stew");
    expect(md).toContain("A hearty stew.");
    expect(md).toContain("Yield: 4 servings");
    expect(md).toContain("Total: 1 hr");
    expect(md).toContain("Cuisine: Irish");
  });

  it("renders the yield from the servings columns, unit and all", () => {
    const md = recipeToMarkdown(doc({ name: "Kebabs" }, weighedYieldColumns));
    expect(md).toContain("Yield: 4 kebabs");
  });

  it("omits the yield line when the recipe has no serving count", () => {
    expect(recipeToMarkdown(doc({ name: "Toast" }))).not.toContain("Yield:");
  });

  it("renders ungrouped ingredients as a flat bulleted list", () => {
    const md = recipeToMarkdown(
      doc({ name: "Salad" }, {
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
      doc({ name: "Cake" }, {
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
      recipeToMarkdown(doc({ name: "Air" }, { ingredients: [{ ingredients: [] }] })),
    ).toBe("# Air");
  });

  it("renders a nameless run of steps as a flat list and a named group under its heading", () => {
    const flat = recipeToMarkdown(
      doc({ name: "Quick" }, { instructions: makeSteps(["Mix."]) }),
    );
    expect(flat).toContain("## Instructions");
    expect(flat).toContain("- Mix.");

    const sectioned = recipeToMarkdown(
      doc({ name: "Layered" }, {
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
      recipeToMarkdown(doc({ name: "Air" }, { instructions: [{ steps: [] }] })),
    ).toBe("# Air");
  });
});
