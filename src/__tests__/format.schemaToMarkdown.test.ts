import { describe, it, expect } from "vitest";
import { schemaToMarkdown } from "@/lib/format";
import type { SchemaRecipe } from "@/types/recipe";

describe("schemaToMarkdown", () => {
  it("renders a minimal name-only schema as a single heading", () => {
    expect(schemaToMarkdown({ name: "Toast" })).toBe("# Toast");
  });

  it("includes the description and a metadata line", () => {
    const md = schemaToMarkdown({
      name: "Stew",
      description: "A hearty stew.",
      recipeYield: "4 servings",
      totalTime: "PT1H",
      recipeCuisine: "Irish",
    });
    expect(md).toContain("# Stew");
    expect(md).toContain("A hearty stew.");
    expect(md).toContain("Yield: 4 servings");
    expect(md).toContain("Total: 1 hr");
    expect(md).toContain("Cuisine: Irish");
  });

  it("renders ungrouped ingredients as a flat bulleted list", () => {
    const md = schemaToMarkdown({
      name: "Salad",
      recipeIngredient: ["1 head lettuce", "2 tomatoes"],
    });
    expect(md).toContain("## Ingredients");
    expect(md).toContain("- 1 head lettuce");
    expect(md).toContain("- 2 tomatoes");
    expect(md).not.toContain("###");
  });

  it("renders grouped ingredients under group subheadings", () => {
    const md = schemaToMarkdown({
      name: "Cake",
      recipeIngredient: [
        { name: "2 cups flour", group: "Cake" },
        { name: "1 cup sugar", group: "Cake" },
        { name: "1 cup butter", group: "Frosting" },
      ],
    });
    expect(md).toContain("### Cake");
    expect(md).toContain("- 2 cups flour");
    expect(md).toContain("### Frosting");
    expect(md).toContain("- 1 cup butter");
  });

  it("renders flat instructions and sectioned instructions", () => {
    const flat = schemaToMarkdown({
      name: "Quick",
      recipeInstructions: [{ "@type": "HowToStep", text: "Mix." }],
    });
    expect(flat).toContain("## Instructions");
    expect(flat).toContain("- Mix.");

    const sectioned = schemaToMarkdown({
      name: "Layered",
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Prep",
          itemListElement: [{ "@type": "HowToStep", text: "Chop onions." }],
        },
      ],
    } as SchemaRecipe);
    expect(sectioned).toContain("## Instructions");
    expect(sectioned).toContain("## Prep");
    expect(sectioned).toContain("- Chop onions.");
  });
});
