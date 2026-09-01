import { describe, it, expect } from "vitest";
import {
  formatDuration,
  formatMS,
  formatNutrientDisplay,
  parseMS,
  parseNumeric,
  pluralize,
  formatDate,
  getFirstImage,
  toArray,
  groupIngredients,
  groupIngredientsWithIndex,
  getIngredientText,
  isOwnRecipe,
  isBrowsableUrl,
  canonicalizeRecipeSource,
  CUSTOM_RECIPE_SOURCE,
  markdownToInstructions,
  normalizeRecipeInstructions,
  toSchemaOrgJsonLd,
  msToIsoDuration,
  schemaToEditableIngredients,
  editableIngredientsToSchema,
  schemaToEditableInstructions,
  editableInstructionsToSchema,
  getYieldLabel,
  getYieldValueReference,
  getYieldUnit,
} from "@/lib/format";
import type {
  EditableIngredients,
  EditableInstructions,
} from "@/types/editor";
import { quantitativeValueYield } from "@/fixtures";

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

describe("formatMS", () => {
  it("blanks a zero duration", () => {
    expect(formatMS(0, 0)).toBe("");
  });
  it("shows m:ss", () => {
    expect(formatMS(5, 30)).toBe("5:30");
    expect(formatMS(0, 45)).toBe("0:45");
    expect(formatMS(2, 0)).toBe("2:00");
  });
  it("does not cap minutes", () => {
    expect(formatMS(90, 0)).toBe("90:00");
  });
});

describe("parseMS", () => {
  it("parses m:ss", () => {
    expect(parseMS("5:30")).toEqual({ minutes: 5, seconds: 30 });
  });
  it("carries seconds >= 60 into minutes", () => {
    expect(parseMS("1:90")).toEqual({ minutes: 2, seconds: 30 });
  });
  it("treats a bare number as minutes", () => {
    expect(parseMS("5")).toEqual({ minutes: 5, seconds: 0 });
  });
  it("treats blank/garbage as zero", () => {
    expect(parseMS("")).toEqual({ minutes: 0, seconds: 0 });
    expect(parseMS("abc")).toEqual({ minutes: 0, seconds: 0 });
  });
});

describe("parseNumeric", () => {
  it("returns null for an empty (or whitespace-only) string", () => {
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric("   ")).toBeNull();
  });
  it("parses integers and decimals", () => {
    expect(parseNumeric("3.5")).toBe(3.5);
    expect(parseNumeric(" 42 ")).toBe(42);
    expect(parseNumeric("0")).toBe(0);
  });
  it("returns undefined for unparseable input", () => {
    expect(parseNumeric("abc")).toBeUndefined();
    expect(parseNumeric("1.2.3")).toBeUndefined();
  });
});

describe("pluralize", () => {
  it("returns the singular for a count of 1", () => {
    expect(pluralize(1, "ingredient")).toBe("ingredient");
  });
  it("returns the plural for 0 and other counts", () => {
    expect(pluralize(0, "item")).toBe("items");
    expect(pluralize(2, "item")).toBe("items");
  });
  it("uses an explicit plural when given", () => {
    expect(pluralize(1, "berry", "berries")).toBe("berry");
    expect(pluralize(3, "berry", "berries")).toBe("berries");
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

describe("getYieldLabel", () => {
  it("returns a plain string as-is", () => {
    expect(getYieldLabel("4 servings")).toBe("4 servings");
  });

  it("returns the first element of an array", () => {
    expect(getYieldLabel(["6 servings", "6"])).toBe("6 servings");
  });

  it("joins value and unitText for a QuantitativeValue", () => {
    expect(
      getYieldLabel({ "@type": "QuantitativeValue", value: 4, unitText: "kebabs" }),
    ).toBe("4 kebabs");
  });

  it("returns just the value when a QuantitativeValue has no unit", () => {
    expect(getYieldLabel({ value: 4 })).toBe("4");
  });

  it("returns null for a QuantitativeValue with nothing to show", () => {
    expect(getYieldLabel({})).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(getYieldLabel(undefined)).toBeNull();
  });
});

describe("getYieldValueReference", () => {
  it("returns the valueReference of a QuantitativeValue", () => {
    expect(getYieldValueReference(quantitativeValueYield)).toEqual(
      quantitativeValueYield.valueReference,
    );
  });

  it("returns null when a QuantitativeValue has no valueReference", () => {
    expect(getYieldValueReference({ value: 4, unitText: "kebabs" })).toBeNull();
  });

  it("returns null for a string yield", () => {
    expect(getYieldValueReference("4 servings")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(getYieldValueReference(undefined)).toBeNull();
  });
});

describe("getYieldUnit", () => {
  it("returns the unitText of a QuantitativeValue", () => {
    expect(getYieldUnit({ value: 4, unitText: "kebabs" })).toBe("kebabs");
  });

  it("returns null when a QuantitativeValue has no unitText", () => {
    expect(getYieldUnit({ value: 4 })).toBeNull();
  });

  it("returns null for a string yield", () => {
    expect(getYieldUnit("4 servings")).toBeNull();
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

// The one marker of "this recipe is mine" — deliberately an exact match on a
// literal rather than anything derived from the site's hostname, which is what
// this replaced (see db/migrations/0015).
describe("isOwnRecipe", () => {
  it("is true for the custom source", () => {
    expect(isOwnRecipe({ source: CUSTOM_RECIPE_SOURCE })).toBe(true);
    expect(CUSTOM_RECIPE_SOURCE).toBe("custom");
  });

  it("is false for a scraped domain", () => {
    expect(isOwnRecipe({ source: "seriouseats.com" })).toBe(false);
  });

  it("is false for a missing source", () => {
    expect(isOwnRecipe({})).toBe(false);
    expect(isOwnRecipe({ source: undefined })).toBe(false);
    expect(isOwnRecipe({ source: null })).toBe(false);
    expect(isOwnRecipe({ source: "" })).toBe(false);
  });

  // `source` is a free-text field an agent or a person fills in, so the read
  // side is lenient about casing even though the write side is not.
  it("is case-insensitive", () => {
    expect(isOwnRecipe({ source: "Custom" })).toBe(true);
    expect(isOwnRecipe({ source: "CUSTOM" })).toBe(true);
    expect(isOwnRecipe({ source: "cUsToM" })).toBe(true);
  });
});

describe("canonicalizeRecipeSource", () => {
  it("folds any casing of the own-recipe value to the lowercase literal", () => {
    expect(canonicalizeRecipeSource("Custom")).toBe(CUSTOM_RECIPE_SOURCE);
    expect(canonicalizeRecipeSource("CUSTOM")).toBe(CUSTOM_RECIPE_SOURCE);
    expect(canonicalizeRecipeSource(CUSTOM_RECIPE_SOURCE)).toBe(
      CUSTOM_RECIPE_SOURCE,
    );
  });

  // Everything else is a name, not a token — its casing is content.
  it("leaves any other source untouched", () => {
    expect(canonicalizeRecipeSource("An Edible Mosaic")).toBe(
      "An Edible Mosaic",
    );
    expect(canonicalizeRecipeSource("seriouseats.com")).toBe("seriouseats.com");
    expect(canonicalizeRecipeSource("")).toBe("");
  });
});

describe("isBrowsableUrl", () => {
  it("accepts absolute http and https URLs", () => {
    expect(isBrowsableUrl("https://seriouseats.com/adana-kebab")).toBe(true);
    expect(isBrowsableUrl("http://example.com")).toBe(true);
  });

  it("rejects a half-typed URL", () => {
    expect(isBrowsableUrl("htt")).toBe(false);
    expect(isBrowsableUrl("example.com")).toBe(false);
    expect(isBrowsableUrl("/recipes/1")).toBe(false);
  });

  it("rejects blank input", () => {
    expect(isBrowsableUrl("")).toBe(false);
    expect(isBrowsableUrl(null)).toBe(false);
    expect(isBrowsableUrl(undefined)).toBe(false);
  });

  // The href this guards is user-editable, so a scheme that executes rather
  // than navigates must never reach it.
  it("rejects schemes that are not http(s)", () => {
    expect(isBrowsableUrl("javascript:alert(1)")).toBe(false);
    expect(isBrowsableUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isBrowsableUrl("file:///etc/passwd")).toBe(false);
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

describe("groupIngredientsWithIndex", () => {
  it("carries original array indices through flat lists", () => {
    const result = groupIngredientsWithIndex(["2 cups flour", "1 cup sugar"]);
    expect(result).toHaveLength(1);
    expect(result[0].items).toEqual([
      { ingredient: "2 cups flour", index: 0 },
      { ingredient: "1 cup sugar", index: 1 },
    ]);
  });

  it("preserves original indices when interleaved groups are reordered", () => {
    const ingredients = [
      { name: "2 cups flour", group: "Cake" },
      { name: "1 tsp vanilla", group: "Frosting" },
      { name: "1 cup sugar", group: "Cake" },
    ];
    const result = groupIngredientsWithIndex(ingredients);
    expect(result.map((g) => g.heading)).toEqual(["Cake", "Frosting"]);
    // "1 cup sugar" moved into the Cake bucket but keeps index 2 — the join
    // key back to recipe_ingredients.position.
    expect(result[0].items.map((i) => i.index)).toEqual([0, 2]);
    expect(result[1].items.map((i) => i.index)).toEqual([1]);
  });

  it("stays structurally equivalent to groupIngredients", () => {
    const ingredients = [
      "plain string",
      { name: "grouped", group: "Sauce" },
      { name: "also grouped", group: "Sauce" },
    ];
    const indexed = groupIngredientsWithIndex(ingredients);
    expect(
      indexed.map(({ heading, items }) => ({
        heading,
        items: items.map((i) => i.ingredient),
      })),
    ).toEqual(groupIngredients(ingredients));
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

  it("emits name when set; timeRequired only when name and time are both set", () => {
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
      { "@type": "HowToStep", text: "Name only", name: "Boil" },
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
    // `group` and `id` are both app-level fields with no Schema.org meaning —
    // flattening to text is what keeps them out of the public JSON-LD.
    const result = toSchemaOrgJsonLd({
      name: "Pasta",
      recipeIngredient: [
        { name: "2 cups flour", group: "Dough", id: "L1" },
        "1 tsp salt",
      ],
    }) as Record<string, unknown>;
    expect(result.recipeIngredient).toEqual(["2 cups flour", "1 tsp salt"]);
    expect(JSON.stringify(result)).not.toContain("L1");
  });

  it("passes a QuantitativeValue recipeYield through unchanged", () => {
    // All keys (@type/value/unitText/valueReference) are standard Schema.org,
    // so no sanitization is needed — the object survives verbatim.
    const result = toSchemaOrgJsonLd({
      name: "Kebabs",
      recipeYield: quantitativeValueYield,
    }) as Record<string, unknown>;
    expect(result.recipeYield).toEqual(quantitativeValueYield);
  });

  it("emits nutritionOverride in place of the schema's own nutrition", () => {
    const result = toSchemaOrgJsonLd(
      { name: "Pasta", nutrition: { calories: "300 kcal" } },
      { nutritionOverride: { calories: "500 kcal", proteinContent: "10 g" } },
    ) as Record<string, unknown>;
    expect(result.nutrition).toEqual({
      calories: "500 kcal",
      proteinContent: "10 g",
    });
  });

  it("still emits the schema's own nutrition without an override", () => {
    const result = toSchemaOrgJsonLd({
      name: "Pasta",
      nutrition: { calories: "300 kcal" },
    }) as Record<string, unknown>;
    expect(result.nutrition).toEqual({ calories: "300 kcal" });
  });

  it("keeps custom fields out even with a nutrition override", () => {
    const result = toSchemaOrgJsonLd(
      { name: "Pasta", notes: "secret", nutrition: { calories: "300 kcal" } },
      { nutritionOverride: { calories: "500 kcal" } },
    ) as Record<string, unknown>;
    expect(result.notes).toBeUndefined();
    expect(result.nutrition).toEqual({ calories: "500 kcal" });
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

describe("formatNutrientDisplay", () => {
  it("rounds values over 1 to the nearest integer", () => {
    expect(formatNutrientDisplay({ value: 9.96, unit: "g" })).toBe("10 g");
    expect(formatNutrientDisplay({ value: 12.4, unit: "g" })).toBe("12 g");
    expect(formatNutrientDisplay({ value: 37.5, unit: "g" })).toBe("38 g");
  });

  it("leaves integer values untouched", () => {
    expect(formatNutrientDisplay({ value: 148, unit: "kcal" })).toBe("148 kcal");
  });

  it("rounds values of 1 or less to 2dp instead of integer", () => {
    // Rounding 0.2 g of fiber to "0 g" would erase the value entirely.
    expect(formatNutrientDisplay({ value: 0.96, unit: "g" })).toBe("0.96 g");
    expect(formatNutrientDisplay({ value: 0.2, unit: "g" })).toBe("0.2 g");
    expect(formatNutrientDisplay({ value: 0.1234, unit: "g" })).toBe("0.12 g");
    expect(formatNutrientDisplay({ value: 1, unit: "g" })).toBe("1 g");
  });

  it("prints bare when the unit is empty", () => {
    expect(formatNutrientDisplay({ value: 250, unit: "" })).toBe("250");
  });
});
