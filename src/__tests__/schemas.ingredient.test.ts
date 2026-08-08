import { describe, it, expect } from "vitest";
import {
  DEFAULT_INGREDIENT_SOURCE,
  INGREDIENT_SOURCES,
  ingredientCreateInputSchema,
} from "@/lib/schemas/ingredient";
import { NUTRITION_FIELDS } from "@/lib/nutritionFields";
import { nutritionSchema } from "@/lib/schemas/nutrition";

// The nutrition validator's shape is generated from NUTRITION_FIELDS, so these
// exercise it behaviourally — the object itself is module-private, and a
// generated shape is exactly the kind that can go subtly wrong (every key
// present but validating nothing, say) without a compile error.

const allNutrients = Object.fromEntries(
  NUTRITION_FIELDS.map((field, i) => [field, i + 1]),
);

describe("NUTRITION_FIELDS vs the schema that declares the nutrients", () => {
  // exhaustiveKeys makes a MISSING or UNKNOWN nutrient a compile error, but key
  // order isn't visible to the type system — and order is read by humans in the
  // MCP tool prose and the manager's columns. So it's pinned here.
  it("lists exactly the schema's nutrients, in the schema's order", () => {
    expect([...NUTRITION_FIELDS]).toEqual(Object.keys(nutritionSchema.shape));
  });
});

describe("ingredient nutrition validator", () => {
  it("accepts and preserves every nutrient the catalog declares", () => {
    const parsed = ingredientCreateInputSchema.parse({
      name: "test",
      nutrition: allNutrients,
    });
    expect(parsed.nutrition).toEqual(allNutrients);
  });

  it("treats every nutrient as optional", () => {
    const parsed = ingredientCreateInputSchema.parse({
      name: "test",
      nutrition: { calories_kcal: 10 },
    });
    expect(parsed.nutrition).toEqual({ calories_kcal: 10 });
  });

  it("strips a key that isn't a catalog nutrient", () => {
    const parsed = ingredientCreateInputSchema.parse({
      name: "test",
      nutrition: { calories_kcal: 10, vitamin_c_mg: 5 },
    });
    expect(parsed.nutrition).toEqual({ calories_kcal: 10 });
  });

  it("rejects a negative value on any nutrient", () => {
    for (const field of NUTRITION_FIELDS) {
      const result = ingredientCreateInputSchema.safeParse({
        name: "test",
        nutrition: { [field]: -1 },
      });
      expect(result.success, `${field} should reject -1`).toBe(false);
    }
  });
});

describe("ingredient source enum", () => {
  it("defaults to the documented provenance", () => {
    const parsed = ingredientCreateInputSchema.parse({ name: "test" });
    expect(parsed.source).toBe(DEFAULT_INGREDIENT_SOURCE);
    expect(INGREDIENT_SOURCES).toContain(DEFAULT_INGREDIENT_SOURCE);
  });

  it("accepts every declared source and nothing else", () => {
    for (const source of INGREDIENT_SOURCES) {
      expect(
        ingredientCreateInputSchema.safeParse({ name: "test", source }).success,
      ).toBe(true);
    }
    expect(
      ingredientCreateInputSchema.safeParse({ name: "test", source: "scraped" })
        .success,
    ).toBe(false);
  });
});
