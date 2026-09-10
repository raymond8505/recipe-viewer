import { describe, it, expect } from "vitest";
import { recipeToMarkdown } from "@/lib/format";
import type { SchemaRecipe } from "@/types/recipe";
import { makeIngredientGroup, makeIngredientLines, quantitativeValueYield } from "@/fixtures";

describe("recipeToMarkdown", () => {
  it("renders a minimal name-only recipe as a single heading", () => {
    expect(recipeToMarkdown({ name: "Toast" }, [])).toBe("# Toast");
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
    );
    expect(md).toContain("Yield: 4 kebabs");
  });

  it("renders ungrouped ingredients as a flat bulleted list", () => {
    const md = recipeToMarkdown(
      { name: "Salad" },
      makeIngredientLines(["1 head lettuce", "2 tomatoes"]),
    );
    expect(md).toContain("## Ingredients");
    expect(md).toContain("- 1 head lettuce");
    expect(md).toContain("- 2 tomatoes");
    expect(md).not.toContain("###");
  });

  it("renders grouped ingredients under group subheadings", () => {
    const md = recipeToMarkdown({ name: "Cake" }, [
      makeIngredientGroup("Cake", ["2 cups flour", "1 cup sugar"]),
      makeIngredientGroup("Frosting", ["1 cup butter"]),
    ]);
    expect(md).toContain("### Cake");
    expect(md).toContain("- 2 cups flour");
    expect(md).toContain("### Frosting");
    expect(md).toContain("- 1 cup butter");
  });

  it("omits the ingredients section when every group is empty", () => {
    expect(recipeToMarkdown({ name: "Air" }, [{ ingredients: [] }])).toBe("# Air");
  });

  it("renders flat instructions and sectioned instructions", () => {
    const flat = recipeToMarkdown(
      {
        name: "Quick",
        recipeInstructions: [{ "@type": "HowToStep", text: "Mix." }],
      },
      [],
    );
    expect(flat).toContain("## Instructions");
    expect(flat).toContain("- Mix.");

    const sectioned = recipeToMarkdown(
      {
        name: "Layered",
        recipeInstructions: [
          {
            "@type": "HowToSection",
            name: "Prep",
            itemListElement: [{ "@type": "HowToStep", text: "Chop onions." }],
          },
        ],
      } as SchemaRecipe,
      [],
    );
    expect(sectioned).toContain("## Instructions");
    expect(sectioned).toContain("## Prep");
    expect(sectioned).toContain("- Chop onions.");
  });
});
