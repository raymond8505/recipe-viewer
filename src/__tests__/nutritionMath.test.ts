import { describe, expect, it } from "vitest";
import {
  computeLineNutrition,
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

describe("computeLineNutrition", () => {
  const catalogButter = {
    nutrition: { calories_kcal: 717, fat_g: 81 },
    density_g_per_ml: 0.911,
  };

  it("computes grams and scaled nutrition for a weight line", () => {
    const result = computeLineNutrition(
      { quantity: 100, unit: "g", ingredient_id: "ing-1" },
      catalogButter,
    );
    expect(result).toEqual({
      kind: "ok",
      grams: 100,
      nutrition: { calories_kcal: 717, fat_g: 81 },
    });
  });

  it("computes a volume line through density", () => {
    const result = computeLineNutrition(
      { quantity: 1, unit: "tbsp", ingredient_id: "ing-1" },
      catalogButter,
    );
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    // 14.7868 ml * 0.911 g/ml = 13.4708 g
    expect(result.grams).toBeCloseTo(13.4708, 3);
    expect(result.nutrition.calories_kcal).toBeCloseTo(96.586, 2);
  });

  it("excludes unmatched lines (null ingredient_id or missing catalog row)", () => {
    expect(
      computeLineNutrition(
        { quantity: 1, unit: "g", ingredient_id: null },
        catalogButter,
      ),
    ).toEqual({ kind: "excluded", reason: "unmatched" });
    expect(
      computeLineNutrition({ quantity: 1, unit: "g", ingredient_id: "ing-1" }, null),
    ).toEqual({ kind: "excluded", reason: "unmatched" });
  });

  it("excludes matched lines whose catalog row has no nutrition", () => {
    expect(
      computeLineNutrition(
        { quantity: 1, unit: "g", ingredient_id: "ing-1" },
        { nutrition: null, density_g_per_ml: 1 },
      ),
    ).toEqual({ kind: "excluded", reason: "no_nutrition" });
  });

  it("excludes lines without a quantity", () => {
    expect(
      computeLineNutrition(
        { quantity: null, unit: "g", ingredient_id: "ing-1" },
        catalogButter,
      ),
    ).toEqual({ kind: "excluded", reason: "no_quantity" });
  });

  it("excludes count lines without a unit", () => {
    expect(
      computeLineNutrition(
        { quantity: 2, unit: null, ingredient_id: "ing-1" },
        catalogButter,
      ),
    ).toEqual({ kind: "excluded", reason: "no_unit" });
  });

  it("excludes volume lines when the ingredient has no density", () => {
    expect(
      computeLineNutrition(
        { quantity: 1, unit: "cup", ingredient_id: "ing-1" },
        { nutrition: { calories_kcal: 100 }, density_g_per_ml: null },
      ),
    ).toEqual({ kind: "excluded", reason: "no_density" });
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
