import { describe, it, expect } from "vitest";
import { recipeToMarkdown } from "@/lib/format";
import {
  makeIngredientGroup,
  makeIngredientLines,
  makeInstructionGroup,
  makeSteps,
  quantitativeValueYield,
} from "@/fixtures";

describe("recipeToMarkdown", () => {
  it("renders a minimal name-only recipe as a single heading", () => {
    expect(recipeToMarkdown({ name: "Toast" }, [], [])).toBe("# Toast");
  });

  it("includes the description and a metadata line", () => {
    const md = recipeToMarkdown(
      {
        name: "Stew",
        description: "A hearty stew.",
        recipeYield: "4 servings",
        totalTime: "PT1H",
        recipeCuisine: "Irish",
      },
      [],
      [],
    );
    expect(md).toContain("# Stew");
    expect(md).toContain("A hearty stew.");
    expect(md).toContain("Yield: 4 servings");
    expect(md).toContain("Total: 1 hr");
    expect(md).toContain("Cuisine: Irish");
  });

  it("renders an object-form (QuantitativeValue) yield as its label", () => {
    const md = recipeToMarkdown(
      { name: "Kebabs", recipeYield: quantitativeValueYield },
      [],
      [],
    );
    expect(md).toContain("Yield: 4 kebabs");
  });

  it("renders ungrouped ingredients as a flat bulleted list", () => {
    const md = recipeToMarkdown(
      { name: "Salad" },
      makeIngredientLines(["1 head lettuce", "2 tomatoes"]),
      [],
    );
    expect(md).toContain("## Ingredients");
    expect(md).toContain("- 1 head lettuce");
    expect(md).toContain("- 2 tomatoes");
    expect(md).not.toContain("###");
  });

  it("renders grouped ingredients under group subheadings", () => {
    const md = recipeToMarkdown(
      { name: "Cake" },
      [
        makeIngredientGroup("Cake", ["2 cups flour", "1 cup sugar"]),
        makeIngredientGroup("Frosting", ["1 cup butter"]),
      ],
      [],
    );
    expect(md).toContain("### Cake");
    expect(md).toContain("- 2 cups flour");
    expect(md).toContain("### Frosting");
    expect(md).toContain("- 1 cup butter");
  });

  it("omits the ingredients section when every group is empty", () => {
    expect(recipeToMarkdown({ name: "Air" }, [{ ingredients: [] }], [])).toBe("# Air");
  });

  it("renders a nameless run of steps as a flat list and a named group under its heading", () => {
    const flat = recipeToMarkdown({ name: "Quick" }, [], makeSteps(["Mix."]));
    expect(flat).toContain("## Instructions");
    expect(flat).toContain("- Mix.");

    const sectioned = recipeToMarkdown({ name: "Layered" }, [], [
      makeInstructionGroup(undefined, ["Preheat."]),
      makeInstructionGroup("Prep", ["Chop onions."]),
    ]);
    expect(sectioned).toBe(
      "# Layered\n\n## Instructions\n- Preheat.\n\n## Prep\n- Chop onions.",
    );
  });

  it("omits the instructions section when every group is empty", () => {
    expect(recipeToMarkdown({ name: "Air" }, [], [{ steps: [] }])).toBe("# Air");
  });
});
