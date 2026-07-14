// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  recipeImageUploadInputSchema,
  schemaRecipeSchema,
} from "@/lib/schemas/recipe";

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
