import { describe, expect, it } from "vitest";
import {
  computeLineNutrition,
  explicitWeightGrams,
  gramsForLine,
  perPortionNutrition,
  scaleNutritionToGrams,
  sumNutrition,
} from "@/lib/nutritionMath";

describe("gramsForLine", () => {
  it("converts weight units directly to grams", () => {
    expect(gramsForLine(2, "oz", null)).toBeCloseTo(56.699, 3);
    expect(gramsForLine(1, "kg", null)).toBe(1000);
    expect(gramsForLine(150, "g", null)).toBe(150);
  });

  it("converts volume units through density", () => {
    // 1 tsp = 4.92892 ml; olive oil ~0.92 g/ml
    expect(gramsForLine(1, "tsp", 0.92)).toBeCloseTo(4.5346, 3);
    expect(gramsForLine(1, "cup", 1)).toBeCloseTo(236.588, 3);
  });

  it("returns null for a volume unit without density", () => {
    expect(gramsForLine(1, "tbsp", null)).toBeNull();
  });

  it("returns null for unitless (count) lines", () => {
    expect(gramsForLine(2, null, 1)).toBeNull();
  });

  it("returns null without a quantity", () => {
    expect(gramsForLine(null, "g", 1)).toBeNull();
  });
});

describe("scaleNutritionToGrams", () => {
  it("scales per-100g values by grams/100", () => {
    expect(
      scaleNutritionToGrams({ calories_kcal: 375, protein_g: 18 }, 50),
    ).toEqual({ calories_kcal: 187.5, protein_g: 9 });
  });

  it("keeps key sparsity — absent keys stay absent", () => {
    const scaled = scaleNutritionToGrams({ sodium_mg: 40 }, 200);
    expect(scaled).toEqual({ sodium_mg: 80 });
    expect("calories_kcal" in scaled).toBe(false);
  });
});

describe("explicitWeightGrams", () => {
  it("extracts parenthesized weight annotations in grams", () => {
    expect(explicitWeightGrams("3 tablespoons gochujang paste (45g)")).toBe(45);
    expect(explicitWeightGrams("1 stick butter (4 oz)")).toBeCloseTo(113.398, 3);
    expect(explicitWeightGrams("(1.5 kg) whole chicken")).toBe(1500);
    expect(explicitWeightGrams("flour (45 grams)")).toBe(45);
  });

  it("skips non-weight parentheticals and finds the weight among several", () => {
    expect(
      explicitWeightGrams("2 tbsp gochujang (depending on preference) (30 g)"),
    ).toBe(30);
  });

  it("finds the weight among prep notes inside one parenthetical", () => {
    expect(explicitWeightGrams("3 garlic cloves (minced, 15g)")).toBe(15);
    expect(explicitWeightGrams("1 onion (peeled; diced; 150 g)")).toBe(150);
  });

  it("ignores volume parentheticals — they still need a density", () => {
    expect(explicitWeightGrams("gochujang (45 ml)")).toBeNull();
  });

  it("returns null without a parenthesized weight", () => {
    expect(explicitWeightGrams("100g gochujang paste")).toBeNull();
    expect(explicitWeightGrams("2 eggs")).toBeNull();
  });
});

describe("computeLineNutrition", () => {
  const catalogButter = {
    nutrition: { calories_kcal: 717, fat_g: 81 },
    density_g_per_ml: 0.911,
  };

  it("computes grams and scaled nutrition for a weight line", () => {
    const result = computeLineNutrition(
      { quantity: 100, unit: "g", ingredient_id: "ing-1", raw_text: "100 g butter" },
      catalogButter,
    );
    expect(result).toEqual({
      kind: "ok",
      grams: 100,
      gramsSource: "measured",
      nutrition: { calories_kcal: 717, fat_g: 81 },
    });
  });

  it("computes a volume line through density", () => {
    const result = computeLineNutrition(
      { quantity: 1, unit: "tbsp", ingredient_id: "ing-1", raw_text: "1 tbsp butter" },
      catalogButter,
    );
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    // 14.7868 ml * 0.911 g/ml = 13.4708 g
    expect(result.grams).toBeCloseTo(13.4708, 3);
    expect(result.nutrition.calories_kcal).toBeCloseTo(96.586, 2);
  });

  it("falls back to a weight annotation when a volume line has no density", () => {
    const result = computeLineNutrition(
      {
        quantity: 3,
        unit: "tbsp",
        ingredient_id: "ing-1",
        raw_text: "3 tablespoons gochujang paste (45g)",
      },
      { nutrition: { calories_kcal: 211 }, density_g_per_ml: null },
    );
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.grams).toBe(45);
    expect(result.nutrition.calories_kcal).toBeCloseTo(94.95, 2);
  });

  it("rescues count and quantity-less lines that carry a weight annotation", () => {
    expect(
      computeLineNutrition(
        { quantity: 2, unit: null, ingredient_id: "ing-1", raw_text: "2 eggs (100g)" },
        catalogButter,
      ),
    ).toMatchObject({ kind: "ok", grams: 100 });
    // The weight can sit among prep notes in the same parenthetical.
    expect(
      computeLineNutrition(
        {
          quantity: 3,
          unit: null,
          ingredient_id: "ing-1",
          raw_text: "3 garlic cloves (minced, 15g)",
        },
        catalogButter,
      ),
    ).toMatchObject({ kind: "ok", grams: 15 });
    expect(
      computeLineNutrition(
        {
          quantity: null,
          unit: null,
          ingredient_id: "ing-1",
          raw_text: "butter to taste (10 g)",
        },
        catalogButter,
      ),
    ).toMatchObject({ kind: "ok", grams: 10 });
  });

  it("prefers the parsed conversion over the annotation when both work", () => {
    const result = computeLineNutrition(
      {
        quantity: 100,
        unit: "g",
        ingredient_id: "ing-1",
        raw_text: "100 g butter (3.5 oz)",
      },
      catalogButter,
    );
    // 100 g parsed wins; the (3.5 oz ≈ 99.2 g) annotation is ignored.
    expect(result).toMatchObject({ kind: "ok", grams: 100 });
  });

  it("excludes unmatched lines (null ingredient_id or missing catalog row)", () => {
    expect(
      computeLineNutrition(
        { quantity: 1, unit: "g", ingredient_id: null, raw_text: "1 g butter" },
        catalogButter,
      ),
    ).toEqual({ kind: "excluded", reason: "unmatched" });
    expect(
      computeLineNutrition(
        { quantity: 1, unit: "g", ingredient_id: "ing-1", raw_text: "1 g butter" },
        null,
      ),
    ).toEqual({ kind: "excluded", reason: "unmatched" });
  });

  it("excludes matched lines whose catalog row has no nutrition", () => {
    expect(
      computeLineNutrition(
        { quantity: 1, unit: "g", ingredient_id: "ing-1", raw_text: "1 g salt" },
        { nutrition: null, density_g_per_ml: 1 },
      ),
    ).toEqual({ kind: "excluded", reason: "no_nutrition" });
  });

  it("excludes lines without a quantity", () => {
    expect(
      computeLineNutrition(
        { quantity: null, unit: "g", ingredient_id: "ing-1", raw_text: "butter" },
        catalogButter,
      ),
    ).toEqual({ kind: "excluded", reason: "no_quantity" });
  });

  it("excludes count lines without a unit", () => {
    expect(
      computeLineNutrition(
        { quantity: 2, unit: null, ingredient_id: "ing-1", raw_text: "2 eggs" },
        catalogButter,
      ),
    ).toEqual({ kind: "excluded", reason: "no_unit" });
  });

  it("excludes volume lines when the ingredient has no density", () => {
    expect(
      computeLineNutrition(
        { quantity: 1, unit: "cup", ingredient_id: "ing-1", raw_text: "1 cup broth" },
        { nutrition: { calories_kcal: 100 }, density_g_per_ml: null },
      ),
    ).toEqual({ kind: "excluded", reason: "no_density" });
  });

  it("uses a stored estimate and marks the provenance 'estimated'", () => {
    const result = computeLineNutrition(
      {
        quantity: 3,
        unit: "tbsp",
        ingredient_id: "ing-1",
        raw_text: "3 tbsp chopped garlic",
        estimated_grams: 26,
      },
      { nutrition: { calories_kcal: 149 }, density_g_per_ml: null },
    );
    expect(result).toEqual({
      kind: "ok",
      grams: 26,
      gramsSource: "estimated",
      nutrition: { calories_kcal: 38.74 },
    });
  });

  it("rescues a count line that has an estimate but no density path", () => {
    // "540 ml canned chickpeas drained" — a can-yield, not a linear density.
    const result = computeLineNutrition(
      {
        quantity: 540,
        unit: "ml",
        ingredient_id: "ing-1",
        raw_text: "540 ml canned chickpeas drained",
        estimated_grams: 325,
      },
      { nutrition: { calories_kcal: 139 }, density_g_per_ml: null },
    );
    expect(result).toMatchObject({ kind: "ok", grams: 325, gramsSource: "estimated" });
  });

  it("lets a stored estimate override the density-derived value", () => {
    // A convertible weight line (100 g) whose curator typed a different weight.
    const result = computeLineNutrition(
      {
        quantity: 100,
        unit: "g",
        ingredient_id: "ing-1",
        raw_text: "100 g butter",
        estimated_grams: 90,
      },
      catalogButter,
    );
    expect(result).toMatchObject({ kind: "ok", grams: 90, gramsSource: "estimated" });
  });
});

describe("sumNutrition", () => {
  it("sums key-wise across lines", () => {
    expect(
      sumNutrition([
        { calories_kcal: 100, protein_g: 5 },
        { calories_kcal: 50, protein_g: 2.5 },
      ]),
    ).toEqual({ calories_kcal: 150, protein_g: 7.5 });
  });

  it("includes a key iff present on at least one line", () => {
    const total = sumNutrition([{ calories_kcal: 100 }, { sodium_mg: 40 }]);
    expect(total).toEqual({ calories_kcal: 100, sodium_mg: 40 });
    expect("fat_g" in total).toBe(false);
  });

  it("returns an empty object for no lines", () => {
    expect(sumNutrition([])).toEqual({});
  });
});

describe("perPortionNutrition", () => {
  it("divides each present key by servings", () => {
    expect(
      perPortionNutrition({ calories_kcal: 800, sodium_mg: 1200 }, 4),
    ).toEqual({ calories_kcal: 200, sodium_mg: 300 });
  });

  it("keeps key sparsity", () => {
    const perPortion = perPortionNutrition({ fiber_g: 8 }, 2);
    expect(perPortion).toEqual({ fiber_g: 4 });
    expect("calories_kcal" in perPortion).toBe(false);
  });
});
