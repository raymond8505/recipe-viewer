import { describe, it, expect } from "vitest";
import {
  formatDuration,
  formatDate,
  getFirstImage,
  toArray,
  groupIngredients,
  getIngredientText,
  instructionsToMarkdown,
  markdownToInstructions,
  normalizeRecipeInstructions,
  ingredientsToText,
  textToIngredients,
  toSchemaOrgJsonLd,
} from "@/lib/format";

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration("PT1H30M")).toBe("1 hr 30 min");
  });

  it("formats minutes only", () => {
    expect(formatDuration("PT45M")).toBe("45 min");
  });

  it("formats hours only", () => {
    expect(formatDuration("PT2H")).toBe("2 hr");
  });

  it("returns null for zero duration", () => {
    expect(formatDuration("PT0S")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(formatDuration(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(formatDuration(null)).toBeNull();
  });

  it("returns null for invalid format", () => {
    expect(formatDuration("not-a-duration")).toBeNull();
  });

  it("handles multi-digit hours and minutes", () => {
    expect(formatDuration("PT12H45M")).toBe("12 hr 45 min");
  });
});

describe("formatDate", () => {
  it("formats an ISO date", () => {
    expect(formatDate("2026-02-25")).toBe("February 25, 2026");
  });

  it("returns null for undefined", () => {
    expect(formatDate(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(formatDate(null)).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(formatDate("not-a-date")).toBeNull();
  });
});

describe("getFirstImage", () => {
  it("returns string image directly", () => {
    expect(getFirstImage("https://example.com/img.jpg")).toBe(
      "https://example.com/img.jpg"
    );
  });

  it("returns first element of array", () => {
    expect(
      getFirstImage(["https://example.com/a.jpg", "https://example.com/b.jpg"])
    ).toBe("https://example.com/a.jpg");
  });

  it("returns null for empty array", () => {
    expect(getFirstImage([])).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(getFirstImage(undefined)).toBeNull();
  });
});

describe("toArray", () => {
  it("wraps a string in an array", () => {
    expect(toArray("Breakfast")).toEqual(["Breakfast"]);
  });

  it("returns array as-is", () => {
    expect(toArray(["Breakfast", "Lunch"])).toEqual(["Breakfast", "Lunch"]);
  });

  it("returns empty array for undefined", () => {
    expect(toArray(undefined)).toEqual([]);
  });

  it("filters empty strings", () => {
    expect(toArray(["Breakfast", "", "Lunch"])).toEqual(["Breakfast", "Lunch"]);
  });
});

describe("getIngredientText", () => {
  it("returns a plain string as-is", () => {
    expect(getIngredientText("2 cups flour")).toBe("2 cups flour");
  });

  it("returns the text field from a RecipeIngredient object", () => {
    expect(getIngredientText({ name: "1 cup sugar", group: "Cake" })).toBe("1 cup sugar");
  });
});

describe("groupIngredients", () => {
  it("returns a single null-headed group when no group is set", () => {
    const result = groupIngredients(["2 cups flour", "1 cup sugar"]);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBeNull();
    expect(result[0].items).toHaveLength(2);
  });

  it("groups ingredients by group", () => {
    const ingredients = [
      { name: "2 cups flour", group: "Cake" },
      { name: "1 tsp vanilla", group: "Frosting" },
      { name: "1 cup sugar", group: "Cake" },
    ];
    const result = groupIngredients(ingredients);
    expect(result).toHaveLength(2);
    expect(result[0].heading).toBe("Cake");
    expect(result[0].items).toHaveLength(2);
    expect(result[1].heading).toBe("Frosting");
    expect(result[1].items).toHaveLength(1);
  });

  it("preserves insertion order of groups", () => {
    const ingredients = [
      { name: "a", group: "B" },
      { name: "b", group: "A" },
      { name: "c", group: "B" },
    ];
    const result = groupIngredients(ingredients);
    expect(result.map((g) => g.heading)).toEqual(["B", "A"]);
  });

  it("puts ingredients without group into a null-headed group", () => {
    const ingredients = [
      "plain string",
      { name: "grouped", group: "Sauce" },
    ];
    const result = groupIngredients(ingredients);
    expect(result).toHaveLength(2);
    expect(result[0].heading).toBeNull();
    expect(result[1].heading).toBe("Sauce");
  });
});

describe("instructionsToMarkdown", () => {
  it("converts flat HowToStep list to bullet lines", () => {
    const result = instructionsToMarkdown([
      { "@type": "HowToStep", text: "Boil water." },
      { "@type": "HowToStep", text: "Add pasta." },
    ]);
    expect(result).toBe("- Boil water.\n\n- Add pasta.");
  });

  it("converts HowToSection list with headers", () => {
    const result = instructionsToMarkdown([
      {
        "@type": "HowToSection",
        name: "For the sauce",
        itemListElement: [
          { text: "Simmer tomatoes." },
          { text: "Add garlic." },
        ],
      },
    ]);
    expect(result).toBe("## For the sauce\n- Simmer tomatoes.\n- Add garlic.");
  });

  it("returns empty string for empty array", () => {
    expect(instructionsToMarkdown([])).toBe("");
  });
});

describe("markdownToInstructions", () => {
  it("parses bullet lines as flat HowToStep list", () => {
    const result = markdownToInstructions("- Boil water.\n- Add pasta.");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ "@type": "HowToStep", text: "Boil water." });
    expect(result[1]).toMatchObject({ "@type": "HowToStep", text: "Add pasta." });
  });

  it("parses numbered lines as HowToStep", () => {
    const result = markdownToInstructions("1. First step\n2. Second step");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ text: "First step" });
    expect(result[1]).toMatchObject({ text: "Second step" });
  });

  it("parses ## headers as HowToSection with nested steps", () => {
    const result = markdownToInstructions("## Sauce\n- Simmer.\n- Season.");
    expect(result).toHaveLength(1);
    const section = result[0] as import("@/types/recipe").HowToSection;
    expect(section["@type"]).toBe("HowToSection");
    expect(section.name).toBe("Sauce");
    expect(section.itemListElement).toHaveLength(2);
  });

  it("ignores empty lines", () => {
    const result = markdownToInstructions("- Step one\n\n- Step two");
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty string", () => {
    expect(markdownToInstructions("")).toHaveLength(0);
  });

  it("round-trips through instructionsToMarkdown", () => {
    const original = [
      {
        "@type": "HowToSection" as const,
        name: "Prep",
        itemListElement: [{ "@type": "HowToStep" as const, text: "Chop onions." }],
      },
    ];
    const md = instructionsToMarkdown(original);
    const parsed = markdownToInstructions(md);
    expect(parsed).toHaveLength(1);
    const section = parsed[0] as import("@/types/recipe").HowToSection;
    expect(section.name).toBe("Prep");
    expect(section.itemListElement[0].text).toBe("Chop onions.");
  });
});

describe("ingredientsToText", () => {
  it("converts plain strings to one per line", () => {
    expect(ingredientsToText(["2 cups flour", "1 tsp salt"])).toBe(
      "2 cups flour\n1 tsp salt"
    );
  });

  it("emits ## headers for grouped ingredients", () => {
    const result = ingredientsToText([
      { name: "2 cups flour", group: "Cake" },
      { name: "1 tsp vanilla", group: "Frosting" },
    ]);
    expect(result).toContain("## Cake");
    expect(result).toContain("2 cups flour");
    expect(result).toContain("## Frosting");
    expect(result).toContain("1 tsp vanilla");
  });

  it("returns empty string for empty array", () => {
    expect(ingredientsToText([])).toBe("");
  });
});

describe("textToIngredients", () => {
  it("parses plain lines as strings", () => {
    const result = textToIngredients("2 cups flour\n1 tsp salt");
    expect(result).toEqual(["2 cups flour", "1 tsp salt"]);
  });

  it("parses ## headers as group and attaches to following ingredients", () => {
    const result = textToIngredients("## Cake\n2 cups flour\n1 cup sugar");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "2 cups flour", group: "Cake" });
    expect(result[1]).toEqual({ name: "1 cup sugar", group: "Cake" });
  });

  it("ignores empty lines", () => {
    const result = textToIngredients("2 cups flour\n\n1 tsp salt");
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty string", () => {
    expect(textToIngredients("")).toHaveLength(0);
  });

  it("round-trips through ingredientsToText", () => {
    const original = [
      { name: "2 cups flour", group: "Batter" },
      { name: "1 egg", group: "Batter" },
    ];
    const text = ingredientsToText(original);
    const parsed = textToIngredients(text);
    expect(parsed).toEqual(original);
  });
});

describe("toSchemaOrgJsonLd", () => {
  it("excludes notes from JSON-LD output", () => {
    const result = toSchemaOrgJsonLd({ name: "Pasta", notes: "use fresh herbs" }) as Record<string, unknown>;
    expect(result.notes).toBeUndefined();
  });

  it("excludes cookingNotes from JSON-LD output", () => {
    const result = toSchemaOrgJsonLd({ name: "Pasta", cookingNotes: "less salt next time" }) as Record<string, unknown>;
    expect(result.cookingNotes).toBeUndefined();
  });

  it("includes standard fields in JSON-LD output", () => {
    const result = toSchemaOrgJsonLd({
      name: "Pasta",
      description: "A classic dish",
      cookTime: "PT20M",
    }) as Record<string, unknown>;
    expect(result.name).toBe("Pasta");
    expect(result.description).toBe("A classic dish");
    expect(result.cookTime).toBe("PT20M");
  });

  it("normalizes ingredient objects to strings", () => {
    const result = toSchemaOrgJsonLd({
      name: "Pasta",
      recipeIngredient: [{ name: "2 cups flour", group: "Dough" }, "1 tsp salt"],
    }) as Record<string, unknown>;
    expect(result.recipeIngredient).toEqual(["2 cups flour", "1 tsp salt"]);
  });
});

describe("normalizeRecipeInstructions", () => {
  it("returns undefined for null", () => {
    expect(normalizeRecipeInstructions(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(normalizeRecipeInstructions(undefined)).toBeUndefined();
  });

  it("converts a plain string to HowToStep array", () => {
    const result = normalizeRecipeInstructions("Mix the ingredients.");
    expect(result).toEqual([{ "@type": "HowToStep", text: "Mix the ingredients." }]);
  });

  it("converts a multi-step string to HowToStep array", () => {
    const result = normalizeRecipeInstructions("- Step one\n- Step two");
    expect(result).toEqual([
      { "@type": "HowToStep", text: "Step one" },
      { "@type": "HowToStep", text: "Step two" },
    ]);
  });

  it("returns an array as-is", () => {
    const steps = [{ "@type": "HowToStep", text: "Bake" }];
    expect(normalizeRecipeInstructions(steps)).toBe(steps);
  });

  it("wraps a single non-array object in an array", () => {
    const step = { "@type": "HowToStep", text: "Stir" };
    expect(normalizeRecipeInstructions(step)).toEqual([step]);
  });
});
