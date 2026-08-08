import { describe, it, expect } from "vitest";
import {
  formatServingSize,
  representativePortion,
} from "@/components/ingredients/servingSize";
import type { UsdaFoodPortion } from "@/types/ingredient";

describe("formatServingSize", () => {
  it("uses measureUnit.name for Foundation-shaped portions", () => {
    const portions: UsdaFoodPortion[] = [
      { gramWeight: 128, amount: 1, measureUnit: { name: "cup" } },
    ];
    expect(formatServingSize(portions)).toBe("1 cup ≈ 128 g");
  });

  it("falls back to modifier for SR-Legacy portions (undetermined unit)", () => {
    const portions: UsdaFoodPortion[] = [
      {
        gramWeight: 2.1,
        amount: 1,
        modifier: "tsp, whole",
        measureUnit: { name: "undetermined" },
      },
    ];
    // Sub-gram-adjacent weight keeps one decimal.
    expect(formatServingSize(portions)).toBe("1 tsp, whole ≈ 2.1 g");
  });

  it("defaults amount to 1 when absent", () => {
    const portions: UsdaFoodPortion[] = [
      { gramWeight: 15, modifier: "tbsp" },
    ];
    expect(formatServingSize(portions)).toBe("1 tbsp ≈ 15 g");
  });

  it("omits the measure when no unit is available", () => {
    const portions: UsdaFoodPortion[] = [{ gramWeight: 50 }];
    expect(formatServingSize(portions)).toBe("50 g");
  });

  it("rounds sub-gram weights to one decimal", () => {
    const portions: UsdaFoodPortion[] = [
      { gramWeight: 0.36, amount: 1, modifier: "dash" },
    ];
    expect(formatServingSize(portions)).toBe("1 dash ≈ 0.4 g");
  });

  it("skips zero-weight portions and uses the first usable one", () => {
    const portions: UsdaFoodPortion[] = [
      { gramWeight: 0, modifier: "serving" },
      { gramWeight: 240, amount: 1, measureUnit: { name: "cup" } },
    ];
    expect(formatServingSize(portions)).toBe("1 cup ≈ 240 g");
  });

  it("defaults to a 100 g serving when there are no portions", () => {
    expect(formatServingSize([])).toBe("100 g");
    expect(formatServingSize(null)).toBe("100 g");
    // A portions list where none has a positive weight also falls back.
    expect(formatServingSize([{ gramWeight: 0, modifier: "serving" }])).toBe(
      "100 g",
    );
  });
});

describe("representativePortion", () => {
  it("picks the first portion with a positive weight", () => {
    const portions: UsdaFoodPortion[] = [
      { gramWeight: 0, modifier: "serving" },
      { gramWeight: 55, amount: 1, modifier: '8" tortilla' },
      { gramWeight: 110, amount: 2, modifier: '8" tortilla' },
    ];
    expect(representativePortion(portions)).toEqual({
      gramWeight: 55,
      amount: 1,
      modifier: '8" tortilla',
    });
  });

  it("falls back to a 100 g portion when there is none usable", () => {
    expect(representativePortion(null)).toEqual({ gramWeight: 100 });
    expect(representativePortion([])).toEqual({ gramWeight: 100 });
  });
});
