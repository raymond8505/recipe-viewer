import { describe, it, expect } from "vitest";
import {
  matchedCatalogIngredients,
  formatDuration,
  parseDurationToSeconds,
  formatMS,
  formatNutrientDisplay,
  parseMS,
  parseNumeric,
  pluralize,
  formatDate,
  getFirstImage,
  toArray,
  isOwnRecipe,
  isBrowsableUrl,
  canonicalizeRecipeSource,
  CUSTOM_RECIPE_SOURCE,
  fromSchemaOrgInstructions,
  toSchemaOrgInstructions,
  toSchemaOrgJsonLd,
  msToIsoDuration,
  isIsoDuration,
  secondsToIso,
  formatSeconds,
  formatTimeInput,
  parseTimeInput,
  canonicalizeTimeInput,
  ingredientsToEditable,
  editableToIngredientInput,
  instructionsToEditable,
  toSchemaOrgRecipe,
  editableToInstructions,
  formatServings,
  singularServingUnit,
} from "@/lib/format";
import type {
  EditableIngredients,
  EditableInstructions,
} from "@/types/editor";
import type { HowToStep, RecipeDocument, SchemaRecipe } from "@/types/recipe";
import {
  makeIngredient,
  makeIngredientGroup,
  makeIngredientLines,
  makeMatchedIngredient,
  makeInstructionGroup,
  makeStep,
  makeSteps,
  weighedYieldColumns,
} from "@/fixtures";

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

describe("formatServings", () => {
  it("joins the amount and the unit", () => {
    expect(formatServings(4, "kebabs")).toBe("4 kebabs");
  });

  it("falls back to the generic unit when the source named none", () => {
    expect(formatServings(4, null)).toBe("4 servings");
    expect(formatServings(4, "   ")).toBe("4 servings");
  });

  it("returns null when there is no serving count", () => {
    expect(formatServings(null, "kebabs")).toBeNull();
  });

  // The unit is stored plural, so exactly one of them has to read singular.
  it("singularizes the unit for a count of one", () => {
    expect(formatServings(1, "servings")).toBe("1 serving");
    expect(formatServings(1, "kebabs")).toBe("1 kebab");
    expect(formatServings(1, null)).toBe("1 serving");
  });

  it("keeps the plural for any other count", () => {
    expect(formatServings(2, "kebabs")).toBe("2 kebabs");
    expect(formatServings(0.5, "servings")).toBe("0.5 servings");
  });

  it("formats a fractional amount rather than printing its float", () => {
    expect(formatServings(2.5, "servings")).toBe("2.5 servings");
  });
});

describe("singularServingUnit", () => {
  it.each([
    ["servings", "serving"],
    ["kebabs", "kebab"],
    ["wraps", "wrap"],
  ])("drops the plural s: %j → %j", (plural, singular) => {
    expect(singularServingUnit(plural)).toBe(singular);
  });

  it("falls back to 'serving' when the source named no unit", () => {
    expect(singularServingUnit(null)).toBe("serving");
    expect(singularServingUnit("  ")).toBe("serving");
  });

  it("leaves a word that is already singular alone", () => {
    expect(singularServingUnit("tbsp")).toBe("tbsp");
    expect(singularServingUnit("glass")).toBe("glass");
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

describe("fromSchemaOrgInstructions", () => {
  it("returns nothing for nothing", () => {
    expect(fromSchemaOrgInstructions(undefined)).toEqual([]);
    expect(fromSchemaOrgInstructions([])).toEqual([]);
  });

  // A string is iterable; without the guard it would become one step per character.
  it("reads anything but an array as no steps", () => {
    expect(fromSchemaOrgInstructions("- Mix.\n- Bake." as unknown as HowToStep[])).toEqual([]);
    expect(
      fromSchemaOrgInstructions({ "@type": "HowToStep", text: "Stir." } as unknown as HowToStep[]),
    ).toEqual([]);
  });

  it("groups top-level steps by run around a section, in order", () => {
    expect(
      fromSchemaOrgInstructions([
        { "@type": "HowToStep", text: "One." },
        { "@type": "HowToStep", text: "Two." },
        {
          "@type": "HowToSection",
          name: "Sauce",
          itemListElement: [{ "@type": "HowToStep", text: "Three." }],
        },
        { "@type": "HowToStep", text: "Four." },
      ]),
    ).toEqual([
      makeInstructionGroup(undefined, ["One.", "Two."]),
      makeInstructionGroup("Sauce", ["Three."]),
      makeInstructionGroup(undefined, ["Four."]),
    ]);
  });

  it("keeps a timer only beside a label and only when the duration reads as time", () => {
    expect(
      fromSchemaOrgInstructions([
        { "@type": "HowToStep", text: "Both", name: "Simmer", timeRequired: "PT5M30S" },
        { "@type": "HowToStep", text: "Unlabelled", timeRequired: "PT5M" },
        { "@type": "HowToStep", text: "Zero", name: "Zero", timeRequired: "PT0M" },
        { "@type": "HowToStep", text: "Unreadable", name: "Days", timeRequired: "P4D" },
        { "@type": "HowToStep", text: "Label only", name: "Rest" },
      ]),
    ).toEqual(
      makeSteps([
        makeStep("Both", { name: "Simmer", seconds: 330 }),
        "Unlabelled",
        makeStep("Zero", { name: "Zero" }),
        makeStep("Unreadable", { name: "Days" }),
        makeStep("Label only", { name: "Rest" }),
      ]),
    );
  });

  it("drops objects with no text and steps whose text is blank", () => {
    expect(
      fromSchemaOrgInstructions([
        { "@type": "HowToStep", text: "  " },
        { "@type": "HowToStep" } as unknown as HowToStep,
        { "@type": "HowToStep", text: "Keep." },
      ]),
    ).toEqual(makeSteps(["Keep."]));
  });
});

describe("toSchemaOrgInstructions", () => {
  it("emits a nameless group's steps at the top level and a named group as a section", () => {
    expect(
      toSchemaOrgInstructions([
        makeInstructionGroup(undefined, ["One."]),
        makeInstructionGroup("Sauce", [makeStep("Simmer.", { name: "Simmer", seconds: 330 })]),
        makeInstructionGroup("Empty", []),
      ]),
    ).toEqual([
      { "@type": "HowToStep", text: "One." },
      {
        "@type": "HowToSection",
        name: "Sauce",
        itemListElement: [
          { "@type": "HowToStep", text: "Simmer.", name: "Simmer", timeRequired: "PT5M30S" },
        ],
      },
    ]);
  });

  it("sets timeRequired only on a step with both a label and a duration", () => {
    expect(
      toSchemaOrgInstructions(
        makeSteps([makeStep("Label only", { name: "Rest" }), makeStep("Orphan", { seconds: 60 })]),
      ),
    ).toEqual([
      { "@type": "HowToStep", text: "Label only", name: "Rest" },
      { "@type": "HowToStep", text: "Orphan" },
    ]);
  });

  it("round-trips a canonical list through the edge and back", () => {
    const groups = [
      makeInstructionGroup(undefined, ["One.", "Two."]),
      makeInstructionGroup("Sauce", [
        makeStep("Simmer.", { name: "Simmer", seconds: 330 }),
        makeStep("Rest.", { name: "Rest" }),
      ]),
      makeInstructionGroup(undefined, ["Serve."]),
    ];
    expect(fromSchemaOrgInstructions(toSchemaOrgInstructions(groups))).toEqual(groups);

    const wire = toSchemaOrgInstructions(groups);
    expect(toSchemaOrgInstructions(fromSchemaOrgInstructions(wire))).toEqual(wire);
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

describe("ingredientsToEditable / editableToIngredientInput", () => {
  const groups = [
    makeIngredientGroup(undefined, ["1 tsp salt"]),
    makeIngredientGroup("Dough", ["2 cups flour", "1 egg"]),
  ];

  it("round-trips groups, carrying every row id through the draft", () => {
    const editable = ingredientsToEditable(groups);
    expect(editable.map((g) => g.heading)).toEqual([null, "Dough"]);
    expect(editable[1].items.map((i) => i.recipeIngredientId)).toEqual([
      "ri-2-cups-flour",
      "ri-1-egg",
    ]);
    expect(editableToIngredientInput(editable)).toEqual([
      { ingredients: [{ id: "ri-1-tsp-salt", raw_text: "1 tsp salt" }] },
      {
        name: "Dough",
        ingredients: [
          { id: "ri-2-cups-flour", raw_text: "2 cups flour" },
          { id: "ri-1-egg", raw_text: "1 egg" },
        ],
      },
    ]);
  });

  it("assigns stable drag ids to groups and items, distinct from row ids", () => {
    const editable = ingredientsToEditable(makeIngredientLines(["a", "b"]));
    expect(editable[0].id).toBeTruthy();
    expect(editable[0].items[0].id).toBeTruthy();
    expect(editable[0].items[0].id).not.toBe(editable[0].items[1].id);
    expect(editable[0].items[0].id).not.toBe(editable[0].items[0].recipeIngredientId);
  });

  it("seeds one empty nameless group for a recipe with no ingredients", () => {
    const editable = ingredientsToEditable([]);
    expect(editable).toHaveLength(1);
    expect(editable[0]).toMatchObject({ heading: null, items: [] });
  });

  it("sends a new row without an id, drops blank rows and empty groups, and treats a blank heading as nameless", () => {
    const editable: EditableIngredients = [
      { id: "g0", heading: "  ", items: [{ id: "a", name: "1 onion" }] },
      { id: "g1", heading: "Spices", items: [{ id: "b", name: "  " }] },
    ];
    expect(editableToIngredientInput(editable)).toEqual([
      { ingredients: [{ raw_text: "1 onion" }] },
    ]);
  });

  it("empties to an empty list", () => {
    expect(editableToIngredientInput([])).toEqual([]);
  });
});

describe("instructionsToEditable / editableToInstructions", () => {
  it("round-trips a nameless run and a section with a timer, splitting seconds into minutes:seconds", () => {
    const original = [
      makeInstructionGroup(undefined, ["Preheat oven."]),
      makeInstructionGroup("Sauce", [makeStep("Simmer.", { name: "Simmer", seconds: 330 })]),
    ];
    const editable = instructionsToEditable(original);
    expect(editable.map((g) => g.heading)).toEqual([null, "Sauce"]);
    expect(editable[1].items[0]).toMatchObject({ name: "Simmer", minutes: 5, seconds: 30 });
    expect(editableToInstructions(editable)).toEqual(original);
  });

  it("keeps a name on its own, and a time only beside a name", () => {
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
    expect(editableToInstructions(editable)).toEqual(
      makeSteps([
        makeStep("Name only", { name: "Boil" }),
        "Time only",
        makeStep("Both", { name: "Rest", seconds: 600 }),
      ]),
    );
  });

  it("drops blank-text steps and empty groups, and treats a blank heading as nameless", () => {
    const editable: EditableInstructions = [
      { id: "g0", heading: "  ", items: [{ id: "s0", text: "Keep.", name: "", minutes: 0, seconds: 0 }] },
      { id: "g1", heading: null, items: [{ id: "s1", text: "  ", name: "", minutes: 0, seconds: 0 }] },
      { id: "g2", heading: "Empty", items: [] },
    ];
    expect(editableToInstructions(editable)).toEqual(makeSteps(["Keep."]));
  });

  it("seeds nothing from no groups", () => {
    expect(instructionsToEditable([])).toEqual([]);
  });
});

/** A document with no lines, no steps and no times, for cases about the schema half. */
function doc(schema: SchemaRecipe, overrides: Partial<RecipeDocument> = {}): RecipeDocument {
  return {
    schema,
    ingredients: [],
    instructions: [],
    prep_time: null,
    cook_time: null,
    total_time: null,
    servings_amount: null,
    servings_unit: null,
    total_weight_amount: null,
    total_weight_unit: null,
    ...overrides,
  };
}

describe("toSchemaOrgJsonLd", () => {
  it("excludes notes from JSON-LD output", () => {
    const result = toSchemaOrgJsonLd(doc({ name: "Pasta", notes: "use fresh herbs" })) as Record<string, unknown>;
    expect(result.notes).toBeUndefined();
  });

  it("excludes cookingNotes from JSON-LD output", () => {
    const result = toSchemaOrgJsonLd(doc({ name: "Pasta", cookingNotes: "less salt next time" })) as Record<string, unknown>;
    expect(result.cookingNotes).toBeUndefined();
  });

  it("includes standard fields in JSON-LD output", () => {
    const result = toSchemaOrgJsonLd(
      doc({ name: "Pasta", description: "A classic dish" }),
    ) as Record<string, unknown>;
    expect(result.name).toBe("Pasta");
    expect(result.description).toBe("A classic dish");
  });

  it("emits the times from the columns as ISO 8601", () => {
    const result = toSchemaOrgJsonLd(
      doc({ name: "Pasta" }, { prep_time: 900, cook_time: 5400, total_time: 6300 }),
    ) as Record<string, unknown>;
    expect(result.prepTime).toBe("PT15M");
    expect(result.cookTime).toBe("PT1H30M");
    expect(result.totalTime).toBe("PT1H45M");
  });

  it("emits recipeInstructions from the document's groups, never from a copy in the blob", () => {
    const stale = { recipeInstructions: [{ "@type": "HowToStep", text: "STALE" }] };
    const result = toSchemaOrgJsonLd(
      doc({ name: "Pasta", ...stale } as SchemaRecipe, {
        instructions: [makeInstructionGroup("Sauce", [makeStep("Simmer.", { name: "Simmer", seconds: 330 })])],
      }),
    ) as Record<string, unknown>;
    expect(result.recipeInstructions).toEqual([
      {
        "@type": "HowToSection",
        name: "Sauce",
        itemListElement: [
          { "@type": "HowToStep", text: "Simmer.", name: "Simmer", timeRequired: "PT5M30S" },
        ],
      },
    ]);
    expect(toSchemaOrgJsonLd(doc({ name: "Pasta", ...stale } as SchemaRecipe))).not.toHaveProperty(
      "recipeInstructions",
    );
  });

  it("reads a time from its column, not from a copy the blob still carries", () => {
    // The columns are the times. A blob written before the columns existed, or
    // by a client that still sends `cookTime`, must not leak its stale copy.
    const result = toSchemaOrgJsonLd(
      doc({ name: "Pasta", cookTime: "PT20M" }, { cook_time: 1800 }),
    ) as Record<string, unknown>;
    expect(result.cookTime).toBe("PT30M");
  });

  it("drops a time whose column is null even when the blob has one", () => {
    const result = toSchemaOrgJsonLd(
      doc({ name: "Pasta", prepTime: "PT20M", cookTime: "PT1H" }),
    ) as Record<string, unknown>;
    expect(result).not.toHaveProperty("prepTime");
    expect(result).not.toHaveProperty("cookTime");
    expect(result).not.toHaveProperty("totalTime");
  });

  it("flattens the ingredient groups to strings, in order", () => {
    // Group names and row ids are ours, not Schema.org's — flattening to text
    // is what keeps them out of the public JSON-LD.
    const result = toSchemaOrgJsonLd(
      doc({ name: "Pasta" }, {
        ingredients: [
          makeIngredientGroup("Dough", ["2 cups flour"]),
          makeIngredientGroup(undefined, ["1 tsp salt"]),
        ],
      }),
    ) as Record<string, unknown>;
    expect(result.recipeIngredient).toEqual(["2 cups flour", "1 tsp salt"]);
    expect(JSON.stringify(result)).not.toContain("Dough");
    expect(JSON.stringify(result)).not.toContain("ri-");
  });

  it("omits recipeIngredient for a recipe with no lines", () => {
    const result = toSchemaOrgJsonLd(doc({ name: "Pasta" })) as Record<string, unknown>;
    expect(result).not.toHaveProperty("recipeIngredient");
  });

  it("builds recipeYield from the columns as a QuantitativeValue", () => {
    const result = toSchemaOrgJsonLd(
      doc({ name: "Kebabs" }, weighedYieldColumns),
    ) as Record<string, unknown>;
    expect(result.recipeYield).toEqual({
      "@type": "QuantitativeValue",
      value: 4,
      unitText: "kebabs",
      valueReference: { "@type": "QuantitativeValue", value: 454, unitText: "g" },
    });
  });

  it("omits recipeYield when the recipe has no serving count", () => {
    const result = toSchemaOrgJsonLd(doc({ name: "Kebabs" })) as Record<string, unknown>;
    expect(result).not.toHaveProperty("recipeYield");
  });

  it("names the generic unit when the source named none", () => {
    const result = toSchemaOrgJsonLd(
      doc({ name: "Stew" }, { servings_amount: 6, servings_unit: null }),
    ) as Record<string, unknown>;
    expect(result.recipeYield).toEqual({
      "@type": "QuantitativeValue",
      value: 6,
      unitText: "servings",
    });
  });

  // The blob still carries a frozen pre-0022 copy on older rows. The columns are
  // the source of truth, so a stale string must never reach the output — the
  // same guarantee format.test pins for a stale cookTime.
  it("lets the columns beat a stale recipeYield left in the blob", () => {
    const stale = { name: "Kebabs", recipeYield: "99 portions" } as SchemaRecipe;
    const result = toSchemaOrgJsonLd(
      doc(stale, weighedYieldColumns),
    ) as Record<string, unknown>;
    expect(result.recipeYield).toMatchObject({ value: 4, unitText: "kebabs" });
  });

  it("emits the nutritionOverride, not the schema's own nutrition", () => {
    const result = toSchemaOrgJsonLd(
      doc({ name: "Pasta", nutrition: { calories: "300 kcal" } }),
      { nutritionOverride: { calories: "500 kcal", proteinContent: "10 g" } },
    ) as Record<string, unknown>;
    expect(result.nutrition).toEqual({
      calories: "500 kcal",
      proteinContent: "10 g",
    });
  });

  it("omits nutrition entirely without an override, however full the schema is", () => {
    // The override carries the catalog-derived values and is the only source.
    // Publishing the stored fields as a fallback would put a number in the
    // page's structured data that nothing in the app is willing to display.
    const result = toSchemaOrgJsonLd(
      doc({ name: "Pasta", nutrition: { calories: "300 kcal" } }),
    ) as Record<string, unknown>;
    expect(result).not.toHaveProperty("nutrition");
  });

  it("keeps custom fields out even with a nutrition override", () => {
    const result = toSchemaOrgJsonLd(
      doc({ name: "Pasta", notes: "secret", nutrition: { calories: "300 kcal" } }),
      { nutritionOverride: { calories: "500 kcal" } },
    ) as Record<string, unknown>;
    expect(result.notes).toBeUndefined();
    expect(result.nutrition).toEqual({ calories: "500 kcal" });
  });
});

describe("toSchemaOrgRecipe", () => {
  it("keeps every stored field, custom ones included, and flattens the lines", () => {
    const out = toSchemaOrgRecipe(
      doc({ name: "Pasta", notes: "secret" }, { ingredients: makeIngredientLines(["2 cups flour"]) }),
    );
    expect(out).toEqual({
      name: "Pasta",
      notes: "secret",
      recipeIngredient: ["2 cups flour"],
    });
  });

  it("leaves recipeIngredient off when there are no lines", () => {
    expect(toSchemaOrgRecipe(doc({ name: "Pasta" }))).toEqual({ name: "Pasta" });
  });

  it("emits the times from the columns, overriding any copy in the blob", () => {
    const out = toSchemaOrgRecipe(
      doc(
        { name: "Pasta", prepTime: "PT5M", cookTime: "PT1H", totalTime: "PT1H5M" },
        { prep_time: 600, cook_time: null, total_time: 600 },
      ),
    );
    expect(out).toEqual({ name: "Pasta", prepTime: "PT10M", totalTime: "PT10M" });
  });

  it("emits recipeInstructions from the document's groups", () => {
    const out = toSchemaOrgRecipe(
      doc({ name: "Pasta" }, { instructions: makeSteps(["Boil.", "Drain."]) }),
    );
    expect(out.recipeInstructions).toEqual([
      { "@type": "HowToStep", text: "Boil." },
      { "@type": "HowToStep", text: "Drain." },
    ]);
  });

  it("does not mutate the document's schema", () => {
    const input = doc({ name: "Pasta", cookTime: "PT1H" }, { cook_time: null });
    toSchemaOrgRecipe(input);
    expect(input.schema).toEqual({ name: "Pasta", cookTime: "PT1H" });
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

  // The badges on a recipe card, where the gap costs a pixel the footer needs.
  it("closes the gap before the unit when compact", () => {
    expect(formatNutrientDisplay({ value: 9.96, unit: "g" }, { compact: true })).toBe("10g");
    expect(formatNutrientDisplay({ value: 350, unit: "kcal" }, { compact: true })).toBe("350kcal");
    expect(formatNutrientDisplay({ value: 0.2, unit: "g" }, { compact: true })).toBe("0.2g");
  });

  it("has nothing to close up when compact and the unit is empty", () => {
    expect(formatNutrientDisplay({ value: 250, unit: "" }, { compact: true })).toBe("250");
  });
});

describe("isIsoDuration", () => {
  it("accepts the time-only durations the readers parse", () => {
    expect(isIsoDuration("PT1H30M")).toBe(true);
    expect(isIsoDuration("PT45S")).toBe(true);
  });

  it("accepts a well-formed zero — a no-cook recipe saying so explicitly", () => {
    // The distinction this predicate exists for: formatDuration and
    // parseDurationToSeconds both return null here AND for "P4D", but only
    // one of the two is a value we failed to read.
    expect(isIsoDuration("PT0M")).toBe(true);
    expect(isIsoDuration("PT0S")).toBe(true);
  });

  it("rejects date-bearing durations and human text", () => {
    expect(isIsoDuration("P4D")).toBe(false);
    expect(isIsoDuration("P1DT13H20M")).toBe(false);
    expect(isIsoDuration("20–22 min")).toBe(false);
  });

  it("rejects blank and absent input", () => {
    expect(isIsoDuration("")).toBe(false);
    expect(isIsoDuration(null)).toBe(false);
    expect(isIsoDuration(undefined)).toBe(false);
  });
});

describe("secondsToIso", () => {
  it("normalizes seconds into hours and minutes", () => {
    expect(secondsToIso(5400)).toBe("PT1H30M");
    expect(secondsToIso(2700)).toBe("PT45M");
    expect(secondsToIso(14400)).toBe("PT4H");
  });

  it("keeps a seconds component the column can hold", () => {
    // The reason the column is seconds: nothing is rounded on the way in.
    expect(secondsToIso(30)).toBe("PT30S");
    expect(secondsToIso(14730)).toBe("PT4H5M30S");
  });

  it("returns undefined for no time", () => {
    expect(secondsToIso(null)).toBeUndefined();
    expect(secondsToIso(undefined)).toBeUndefined();
    expect(secondsToIso(0)).toBeUndefined();
  });

  it("round-trips with parseDurationToSeconds, the ISO -> column direction", () => {
    for (const seconds of [30, 300, 2700, 5400, 14400, 14730]) {
      expect(parseDurationToSeconds(secondsToIso(seconds))).toBe(seconds);
    }
  });
});

describe("formatSeconds", () => {
  it("renders a column value the way formatDuration renders ISO", () => {
    expect(formatSeconds(5400)).toBe("1 hr 30 min");
    expect(formatSeconds(2700)).toBe("45 min");
    expect(formatSeconds(14400)).toBe("4 hr");
  });

  it("returns null when there is no time", () => {
    expect(formatSeconds(null)).toBeNull();
    expect(formatSeconds(undefined)).toBeNull();
  });
});

describe("formatTimeInput", () => {
  it("renders H:MM with a padded minute", () => {
    expect(formatTimeInput(5400)).toBe("1:30");
    expect(formatTimeInput(2700)).toBe("0:45");
    expect(formatTimeInput(14400)).toBe("4:00");
    expect(formatTimeInput(300)).toBe("0:05");
  });

  it("rounds to the nearest minute — HH:MM cannot express finer", () => {
    // The documented lossy edge: editing such a recipe rewrites the seconds
    // away. Two values in the whole recipe set are affected.
    expect(formatTimeInput(14730)).toBe("4:06");
    expect(formatTimeInput(30)).toBe("0:01");
  });

  it("is blank for no time", () => {
    expect(formatTimeInput(null)).toBe("");
    expect(formatTimeInput(undefined)).toBe("");
    expect(formatTimeInput(0)).toBe("");
  });
});

describe("parseTimeInput", () => {
  it("reads H:MM as hours and minutes, in seconds", () => {
    expect(parseTimeInput("1:30")).toBe(5400);
    expect(parseTimeInput("0:45")).toBe(2700);
    expect(parseTimeInput("4:00")).toBe(14400);
  });

  it("reads the colon as hours, not the m:ss parseMS uses", () => {
    // "1:30" on a recipe is an hour and a half; on a step timer it is 90
    // seconds. Different fields, deliberately different readings.
    expect(parseTimeInput("1:30")).toBe(5400);
    expect(parseMS("1:30")).toEqual({ minutes: 1, seconds: 30 });
  });

  it("carries minutes past 59 into hours, as parseMS does", () => {
    expect(parseTimeInput("1:75")).toBe(135 * 60);
  });

  it("reads a bare number as minutes", () => {
    expect(parseTimeInput("90")).toBe(5400);
    expect(parseTimeInput(" 45 ")).toBe(2700);
  });

  it("reads unit-tagged forms", () => {
    expect(parseTimeInput("90 min")).toBe(5400);
    expect(parseTimeInput("1h")).toBe(3600);
    expect(parseTimeInput("1h30m")).toBe(5400);
    expect(parseTimeInput("1 hr 30 min")).toBe(5400);
    expect(parseTimeInput("2 hours")).toBe(7200);
  });

  it("returns null for blank or zero — both mean 'no time'", () => {
    expect(parseTimeInput("")).toBeNull();
    expect(parseTimeInput("   ")).toBeNull();
    expect(parseTimeInput("0")).toBeNull();
    expect(parseTimeInput("0:00")).toBeNull();
    expect(parseTimeInput("0 min")).toBeNull();
  });

  it("returns undefined for unparseable input so a save degrades to no-change", () => {
    expect(parseTimeInput("a while")).toBeUndefined();
    expect(parseTimeInput("-5")).toBeUndefined();
    expect(parseTimeInput("1:2:3")).toBeUndefined();
  });
});

describe("canonicalizeTimeInput", () => {
  it("re-spells every accepted form as H:MM", () => {
    expect(canonicalizeTimeInput("45")).toBe("0:45");
    expect(canonicalizeTimeInput("1h30m")).toBe("1:30");
    expect(canonicalizeTimeInput("90 min")).toBe("1:30");
    expect(canonicalizeTimeInput("1:75")).toBe("2:15");
  });

  it("leaves an already-canonical value alone", () => {
    expect(canonicalizeTimeInput("1:30")).toBe("1:30");
  });

  it("blanks a cleared or zero field", () => {
    expect(canonicalizeTimeInput("")).toBe("");
    expect(canonicalizeTimeInput("0:00")).toBe("");
  });

  it("returns null for a typo, so the text stays visible to fix", () => {
    expect(canonicalizeTimeInput("a while")).toBeNull();
  });

  it("round-trips with parseTimeInput", () => {
    for (const raw of ["45", "1:30", "1h30m", "4:00"]) {
      expect(parseTimeInput(canonicalizeTimeInput(raw) as string)).toBe(
        parseTimeInput(raw),
      );
    }
  });
});

describe("matchedCatalogIngredients", () => {
  const cilantro = makeIngredient("cat-cilantro", "Coriander (cilantro) leaves, raw", {
    aliases: ["fresh coriander", "cilantro leaves"],
  });
  const butter = makeIngredient("cat-butter", "Butter, without salt", {
    aliases: ["unsalted butter"],
  });

  it("matches a catalog name, case-insensitively", () => {
    const groups = makeIngredientLines([makeMatchedIngredient("2 tbsp butter", butter)]);

    expect(matchedCatalogIngredients(groups, "BUTTER")).toEqual(["Butter, without salt"]);
  });

  // The point of the feature: the recipe says "fresh coriander" and the
  // searcher typed "cilantro".
  it("matches an alias but reports the catalog name", () => {
    const groups = makeIngredientLines([makeMatchedIngredient("1 bunch fresh coriander", cilantro)]);

    expect(matchedCatalogIngredients(groups, "cilantro")).toEqual([
      "Coriander (cilantro) leaves, raw",
    ]);
  });

  it("names an ingredient once however many lines resolve to it", () => {
    const groups = [
      makeIngredientGroup("Sauce", [makeMatchedIngredient("2 tbsp butter", butter)]),
      makeIngredientGroup("Top", [makeMatchedIngredient("1 tsp butter", butter)]),
    ];

    expect(matchedCatalogIngredients(groups, "butter")).toEqual(["Butter, without salt"]);
  });

  it("caps how many it reports, so a card footer cannot flood", () => {
    const groups = makeIngredientLines([
      makeMatchedIngredient("butter", butter),
      makeMatchedIngredient("coriander", cilantro),
    ]);

    expect(matchedCatalogIngredients(groups, "r", 1)).toHaveLength(1);
  });

  it("ignores a line the catalog was loaded for but did not match", () => {
    const groups = makeIngredientLines([
      makeMatchedIngredient("2 tbsp butter", butter, { ingredient: null }),
    ]);

    expect(matchedCatalogIngredients(groups, "butter")).toEqual([]);
  });

  // The /api/recipes shape: read without `catalog: true`, so `ingredient` is
  // undefined on every line. No badge beats a wrong one.
  it("ignores lines read without the catalog", () => {
    const groups = makeIngredientLines(["2 tbsp butter"]);

    expect(matchedCatalogIngredients(groups, "butter")).toEqual([]);
  });

  // Guards the scoping decision: search speaks the catalog's vocabulary, so a
  // recipe's own line text is never itself a match.
  it("does not match the recipe's own line text", () => {
    const groups = makeIngredientLines([
      makeMatchedIngredient("2 tbsp clarified ghee", butter),
    ]);

    expect(matchedCatalogIngredients(groups, "ghee")).toEqual([]);
  });

  it("matches nothing for an empty or blank query", () => {
    const groups = makeIngredientLines([makeMatchedIngredient("2 tbsp butter", butter)]);

    expect(matchedCatalogIngredients(groups, "")).toEqual([]);
    expect(matchedCatalogIngredients(groups, "   ")).toEqual([]);
  });
});
