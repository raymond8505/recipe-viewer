import { describe, it, expect } from "vitest";
import {
  formatDuration,
  formatDate,
  getFirstImage,
  toArray,
  groupIngredients,
  getIngredientText,
  markdownToInstructions,
  normalizeRecipeInstructions,
  toSchemaOrgJsonLd,
  msToIsoDuration,
  schemaToEditableIngredients,
  editableIngredientsToSchema,
  schemaToEditableInstructions,
  editableInstructionsToSchema,
} from "@/lib/format";
import type {
  EditableIngredients,
  EditableInstructions,
} from "@/types/editor";

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

  it("parses a multi-section markdown block", () => {
    const parsed = markdownToInstructions("## Prep\n- Chop onions.");
    expect(parsed).toHaveLength(1);
    const section = parsed[0] as import("@/types/recipe").HowToSection;
    expect(section.name).toBe("Prep");
    expect(section.itemListElement[0].text).toBe("Chop onions.");
  });
});

describe("msToIsoDuration", () => {
  it("builds minutes + seconds", () => {
    expect(msToIsoDuration(5, 30)).toBe("PT5M30S");
  });

  it("omits the zero component", () => {
    expect(msToIsoDuration(0, 45)).toBe("PT45S");
    expect(msToIsoDuration(2, 0)).toBe("PT2M");
  });

  it("normalizes minutes over 59 into hours", () => {
    expect(msToIsoDuration(90, 0)).toBe("PT1H30M");
  });

  it("returns undefined when both are zero", () => {
    expect(msToIsoDuration(0, 0)).toBeUndefined();
  });

  it("floors and clamps negatives", () => {
    expect(msToIsoDuration(-1, 5)).toBe("PT5S");
  });
});

describe("schemaToEditableIngredients / editableIngredientsToSchema", () => {
  it("round-trips a mix of grouped and ungrouped ingredients", () => {
    const original = [
      "1 tsp salt",
      { name: "2 cups flour", group: "Dough" },
      { name: "1 egg", group: "Dough" },
    ];
    const editable = schemaToEditableIngredients(original);
    // ungrouped section + one named group, in insertion order
    expect(editable.map((g) => g.heading)).toEqual([null, "Dough"]);
    expect(editableIngredientsToSchema(editable)).toEqual(original);
  });

  it("assigns stable ids to groups and items", () => {
    const editable = schemaToEditableIngredients(["a", "b"]);
    expect(editable[0].id).toBeTruthy();
    expect(editable[0].items[0].id).toBeTruthy();
    expect(editable[0].items[0].id).not.toBe(editable[0].items[1].id);
  });

  it("drops blank-name rows and treats a blank heading as ungrouped", () => {
    const editable: EditableIngredients = [
      { id: "g0", heading: "  ", items: [{ id: "a", name: "1 onion" }] },
      { id: "g1", heading: "Spices", items: [{ id: "b", name: "  " }] },
    ];
    expect(editableIngredientsToSchema(editable)).toEqual(["1 onion"]);
  });

  it("empties to an empty list", () => {
    expect(editableIngredientsToSchema([])).toEqual([]);
  });
});

describe("schemaToEditableInstructions / editableInstructionsToSchema", () => {
  it("round-trips top-level steps and a section with a timer", () => {
    const original = [
      { "@type": "HowToStep" as const, text: "Preheat oven." },
      {
        "@type": "HowToSection" as const,
        name: "Sauce",
        itemListElement: [
          {
            "@type": "HowToStep" as const,
            text: "Simmer.",
            name: "Simmer",
            timeRequired: "PT5M30S",
          },
        ],
      },
    ];
    const editable = schemaToEditableInstructions(original);
    expect(editable.map((g) => g.heading)).toEqual([null, "Sauce"]);
    const step = editable[1].items[0];
    expect(step).toMatchObject({ name: "Simmer", minutes: 5, seconds: 30 });
    expect(editableInstructionsToSchema(editable)).toEqual(original);
  });

  it("emits name + timeRequired only when both are set", () => {
    const editable: EditableInstructions = [
      {
        id: "g",
        heading: null,
        items: [
          { id: "s1", text: "Name only", name: "Boil", minutes: 0, seconds: 0 },
          { id: "s2", text: "Time only", name: "", minutes: 0, seconds: 30 },
          { id: "s3", text: "Both", name: "Rest", minutes: 10, seconds: 0 },
        ],
      },
    ];
    const result = editableInstructionsToSchema(editable);
    expect(result).toEqual([
      { "@type": "HowToStep", text: "Name only" },
      { "@type": "HowToStep", text: "Time only" },
      {
        "@type": "HowToStep",
        text: "Both",
        name: "Rest",
        timeRequired: "PT10M",
      },
    ]);
  });

  it("drops blank-text steps and empty groups", () => {
    const editable: EditableInstructions = [
      { id: "g0", heading: null, items: [{ id: "s0", text: "  ", name: "", minutes: 0, seconds: 0 }] },
      { id: "g1", heading: "Empty", items: [] },
    ];
    expect(editableInstructionsToSchema(editable)).toEqual([]);
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
