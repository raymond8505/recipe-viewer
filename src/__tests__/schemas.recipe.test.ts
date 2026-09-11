// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  recipeCreateInputSchema,
  recipeImageUploadInputSchema,
  recipeInstructionsInputSchema,
  schemaOrgRecipeInputSchema,
  schemaRecipeSchema,
} from "@/lib/schemas/recipe";

describe("recipeInstructionsInputSchema", () => {
  it("accepts groups of steps with an optional name and a labelled timer", () => {
    const result = recipeInstructionsInputSchema.safeParse([
      { steps: [{ text: "Chop." }] },
      { name: "Sauce", steps: [{ text: "Simmer.", name: "Simmer", seconds: 330 }] },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects seconds without a name, naming the seconds field", () => {
    const result = recipeInstructionsInputSchema.safeParse([
      { steps: [{ text: "Simmer.", seconds: 330 }] },
    ]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([0, "steps", 0, "seconds"]);
  });

  it("rejects a zero or fractional duration and a blank step", () => {
    expect(
      recipeInstructionsInputSchema.safeParse([{ steps: [{ text: "x", name: "T", seconds: 0 }] }])
        .success,
    ).toBe(false);
    expect(
      recipeInstructionsInputSchema.safeParse([{ steps: [{ text: "x", name: "T", seconds: 1.5 }] }])
        .success,
    ).toBe(false);
    expect(recipeInstructionsInputSchema.safeParse([{ steps: [{ text: "  " }] }]).success).toBe(
      false,
    );
  });
});

describe("schemaOrgRecipeInputSchema — recipeInstructions", () => {
  const withInstructions = (recipeInstructions: unknown) =>
    schemaOrgRecipeInputSchema.safeParse({ name: "Soup", recipeInstructions }).success;

  it("accepts an array of steps, with or without @type, and sections", () => {
    expect(
      withInstructions([
        { "@type": "HowToStep", text: "Chop." },
        { text: "Fry." },
        { "@type": "HowToSection", name: "Sauce", itemListElement: [{ text: "Simmer." }] },
      ]),
    ).toBe(true);
  });

  it("rejects a string, a lone step, and a bare string inside the array", () => {
    expect(withInstructions("- Mix.\n- Bake.")).toBe(false);
    expect(withInstructions({ "@type": "HowToStep", text: "Stir." })).toBe(false);
    expect(withInstructions(["Chop."])).toBe(false);
  });

  it("rejects a section whose itemListElement is missing or a lone step", () => {
    expect(withInstructions([{ "@type": "HowToSection", name: "Bare" }])).toBe(false);
    expect(
      withInstructions([{ "@type": "HowToSection", name: "Lone", itemListElement: { text: "Only." } }]),
    ).toBe(false);
  });

  it("rejects an object that is neither a step nor a section", () => {
    expect(withInstructions([{ name: "no text" }])).toBe(false);
  });
});

describe("recipeImageUploadInputSchema", () => {
  it("accepts an id and a valid imageUrl", () => {
    const result = recipeImageUploadInputSchema.safeParse({
      id: "r1",
      imageUrl: "https://example.com/foo.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing imageUrl", () => {
    const result = recipeImageUploadInputSchema.safeParse({ id: "r1" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-URL imageUrl", () => {
    const result = recipeImageUploadInputSchema.safeParse({
      id: "r1",
      imageUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

// `url` and `source` are coupled: omitting url means "authored on this
// instance", and createRecipe fills in both defaults (own canonical URL +
// CUSTOM_RECIPE_SOURCE). Providing a url without a source is the one shape the
// default must NOT cover — it would label someone else's page as the user's own
// recipe, which is precisely what the Re-scrape control reads.
describe("recipeCreateInputSchema — url/source coupling", () => {
  const schema = { name: "Test Recipe" };

  it("accepts a create with neither url nor source", () => {
    const result = recipeCreateInputSchema.safeParse({ schema });
    expect(result.success).toBe(true);
  });

  it("rejects a url with no source, naming the source field", () => {
    const result = recipeCreateInputSchema.safeParse({
      url: "https://seriouseats.com/adana-kebab",
      schema,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["source"]);
    expect(result.error?.issues[0]?.message).toMatch(/custom/);
  });

  it("accepts a url with a source", () => {
    const result = recipeCreateInputSchema.safeParse({
      url: "https://seriouseats.com/adana-kebab",
      source: "seriouseats.com",
      schema,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an explicit source with no url", () => {
    const result = recipeCreateInputSchema.safeParse({
      source: "instagram.com",
      schema,
    });
    expect(result.success).toBe(true);
  });

  it("still rejects an empty-string source", () => {
    const result = recipeCreateInputSchema.safeParse({ source: "", schema });
    expect(result.success).toBe(false);
  });
});

describe("schemaRecipeSchema — recipeYield valueReference units", () => {
  const withRef = (unitText: string) =>
    schemaRecipeSchema.safeParse({
      name: "Kebabs",
      recipeYield: {
        "@type": "QuantitativeValue",
        value: 4,
        unitText: "kebabs", // serving label stays free text
        valueReference: { "@type": "QuantitativeValue", value: 454, unitText },
      },
    });

  it("accepts each metric valueReference unit (g/kg/ml/l)", () => {
    for (const u of ["g", "kg", "ml", "l"]) {
      expect(withRef(u).success).toBe(true);
    }
  });

  it("rejects an imperial valueReference unit", () => {
    expect(withRef("oz").success).toBe(false);
    expect(withRef("lb").success).toBe(false);
  });

  it("rejects a metric word alias / wrong casing (canonical symbols only)", () => {
    expect(withRef("grams").success).toBe(false);
    expect(withRef("L").success).toBe(false);
    expect(withRef("mL").success).toBe(false);
  });

  it("keeps the serving-level unitText free text", () => {
    const result = schemaRecipeSchema.safeParse({
      name: "Kebabs",
      recipeYield: { "@type": "QuantitativeValue", value: 4, unitText: "kebabs" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a yield with no valueReference", () => {
    const result = schemaRecipeSchema.safeParse({
      name: "Kebabs",
      recipeYield: { "@type": "QuantitativeValue", value: 4, unitText: "kebabs" },
    });
    expect(result.success).toBe(true);
  });
});
