// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  recipeCreateFromSchemaInputSchema,
  recipeCreateInputSchema,
  recipeImageUploadInputSchema,
  recipeInstructionsInputSchema,
  schemaOrgRecipeInputSchema,
  schemaRecipeSchema,
  servingsInputSchema,
  totalWeightInputSchema,
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

// recipeYield validates at the INBOUND EDGE schema, not the stored one: it is
// column-backed, so only a writer that speaks Schema.org (a scrape, an MCP
// create) may send it.
describe("schemaOrgRecipeInputSchema — recipeYield valueReference units", () => {
  const withRef = (unitText: string) =>
    schemaOrgRecipeInputSchema.safeParse({
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
    const result = schemaOrgRecipeInputSchema.safeParse({
      name: "Kebabs",
      recipeYield: { "@type": "QuantitativeValue", value: 4, unitText: "kebabs" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a yield with no valueReference", () => {
    const result = schemaOrgRecipeInputSchema.safeParse({
      name: "Kebabs",
      recipeYield: { "@type": "QuantitativeValue", value: 4, unitText: "kebabs" },
    });
    expect(result.success).toBe(true);
  });
});

describe("schemaRecipeSchema — the column-backed keys", () => {
  // The schema is `.passthrough()`, so a sender CAN still put these on the
  // wire; what matters is that it neither declares nor validates them, which is
  // why the repo layer strips them from every write instead.
  it("declares neither recipeYield nor nutrition.servingSize", () => {
    expect(Object.keys(schemaRecipeSchema.shape)).not.toContain("recipeYield");
    const nutrition = schemaRecipeSchema.shape.nutrition;
    expect(Object.keys(nutrition.unwrap().shape)).not.toContain("servingSize");
  });
});

describe("servingsInputSchema", () => {
  it("takes a positive amount, with or without a unit", () => {
    expect(servingsInputSchema.safeParse({ amount: 4 }).success).toBe(true);
    expect(
      servingsInputSchema.safeParse({ amount: 4, unit: "kebabs" }).success,
    ).toBe(true);
  });

  // null CLEARS the count, which is a different instruction from omitting the
  // key; the repo layer relies on the two staying distinguishable.
  it("takes a null amount as an explicit clear", () => {
    expect(servingsInputSchema.safeParse({ amount: null }).success).toBe(true);
  });

  it("rejects a zero or negative count", () => {
    expect(servingsInputSchema.safeParse({ amount: 0 }).success).toBe(false);
    expect(servingsInputSchema.safeParse({ amount: -2 }).success).toBe(false);
  });

  it("rejects a blank unit — null is how a unit is cleared", () => {
    expect(servingsInputSchema.safeParse({ amount: 4, unit: "" }).success).toBe(
      false,
    );
    expect(
      servingsInputSchema.safeParse({ amount: 4, unit: null }).success,
    ).toBe(true);
  });
});

describe("totalWeightInputSchema", () => {
  it("accepts each metric unit and rejects everything else", () => {
    for (const unit of ["g", "kg", "ml", "l"]) {
      expect(totalWeightInputSchema.safeParse({ amount: 454, unit }).success).toBe(
        true,
      );
    }
    expect(
      totalWeightInputSchema.safeParse({ amount: 454, unit: "cups" }).success,
    ).toBe(false);
  });
});

describe("recipeCreateFromSchemaInputSchema", () => {
  // JSON-LD spells a yield either way, and parseYield reads only the string.
  it("accepts a yield as a number or a string, and stores the string", () => {
    expect(
      recipeCreateFromSchemaInputSchema.parse({ name: "X", recipeYield: 4 }).recipeYield,
    ).toBe("4");
    expect(
      recipeCreateFromSchemaInputSchema.parse({ name: "X", recipeYield: "Makes 12 cookies" })
        .recipeYield,
    ).toBe("Makes 12 cookies");
  });

  // Every spelling a page uses, including the array a co-authored piece carries.
  it("accepts an author as a name, a Person, or an array of either", () => {
    const expected = { "@type": "Person", name: "Kenji" };
    for (const author of ["Kenji", { name: "Kenji" }, [{ name: "Kenji" }], ["Kenji"]]) {
      expect(recipeCreateFromSchemaInputSchema.parse({ name: "X", author }).author).toEqual(
        expected,
      );
    }
  });

  it("keeps the first of several authors, having nowhere to put a second", () => {
    expect(
      recipeCreateFromSchemaInputSchema.parse({
        name: "X",
        author: [{ name: "Diana Henry" }, { name: "Kenji" }],
      }).author,
    ).toEqual({ "@type": "Person", name: "Diana Henry" });
  });

  // The tool's premise: a caller pastes a page's whole JSON-LD, and the keys
  // this app has no use for neither reach storage nor fail the call.
  it("drops the keys the app does not store rather than rejecting them", () => {
    const result = recipeCreateFromSchemaInputSchema.safeParse({
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: "X",
      image: "https://example.com/x.jpg",
      nutrition: { calories: "200 kcal" },
      aggregateRating: { ratingValue: 5 },
      video: { contentUrl: "https://example.com/v.mp4" },
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "X" });
  });

  // A short list would be read as the recipe's own, with no sign a line was lost.
  it("rejects a blank line or step rather than dropping it", () => {
    expect(
      recipeCreateFromSchemaInputSchema.safeParse({
        name: "X",
        recipeIngredient: ["1 egg", "   "],
      }).success,
    ).toBe(false);
    expect(
      recipeCreateFromSchemaInputSchema.safeParse({ name: "X", recipeInstructions: [""] })
        .success,
    ).toBe(false);
  });

  it("requires a name and rejects a url that is not one", () => {
    expect(recipeCreateFromSchemaInputSchema.safeParse({}).success).toBe(false);
    expect(recipeCreateFromSchemaInputSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(
      recipeCreateFromSchemaInputSchema.safeParse({ name: "X", url: "seriouseats.com" })
        .success,
    ).toBe(false);
  });

  // The cap recipe_ingredients.raw_text is written under, applied at this edge
  // too so an over-long line fails here rather than at the insert.
  it("rejects an ingredient line past the raw_text cap", () => {
    expect(
      recipeCreateFromSchemaInputSchema.safeParse({
        name: "X",
        recipeIngredient: ["a".repeat(501)],
      }).success,
    ).toBe(false);
  });
});
