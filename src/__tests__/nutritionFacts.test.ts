import { describe, expect, it } from "vitest";
import {
  nutritionBasisOptions,
  parseDraftNutrition,
} from "@/components/ingredients/nutritionFacts";
import { DEFAULT_PORTION_DRAFT } from "@/components/ingredients/portions";

describe("parseDraftNutrition", () => {
  it("parses numeric strings and keeps key sparsity", () => {
    expect(
      parseDraftNutrition({ calories_kcal: "375", protein_g: "17.8", fat_g: "" }),
    ).toEqual({ calories_kcal: 375, protein_g: 17.8 });
  });

  it("omits unparseable values", () => {
    expect(parseDraftNutrition({ calories_kcal: "abc" })).toEqual({});
  });

  it("parses a trailing-dot number the way a mid-keystroke input produces it", () => {
    expect(parseDraftNutrition({ calories_kcal: "12." })).toEqual({
      calories_kcal: 12,
    });
  });
});

describe("nutritionBasisOptions", () => {
  const cuminPortions = [
    { label: "tsp, whole", grams: "2.1" },
    { label: "tbsp, whole", grams: "6" },
  ];

  it("puts the synthetic 100 g baseline first for portion-bearing rows", () => {
    expect(nutritionBasisOptions(cuminPortions)).toEqual([
      { key: "100g", label: "100 g", grams: 100 },
      { key: "p0", label: "tsp, whole (2.1 g)", grams: 2.1 },
      { key: "p1", label: "tbsp, whole (6 g)", grams: 6 },
    ]);
  });

  it("suppresses the baseline when the seeded default portion is present", () => {
    const options = nutritionBasisOptions([{ ...DEFAULT_PORTION_DRAFT }]);
    expect(options).toEqual([{ key: "p0", label: "100 g", grams: 100 }]);
  });

  it("keeps the baseline alongside a labelled 100 g portion", () => {
    const options = nutritionBasisOptions([{ label: "serving", grams: "100" }]);
    expect(options.map((o) => o.label)).toEqual(["100 g", "serving (100 g)"]);
  });

  it("excludes portions without a positive gram weight", () => {
    const options = nutritionBasisOptions([
      { label: "cup", grams: "" },
      { label: "pinch", grams: "0" },
      { label: "tbsp", grams: "6" },
    ]);
    expect(options.map((o) => o.key)).toEqual(["100g", "p2"]);
  });
});

// The label row-coverage check moved to nutritionLabelRows.test.ts along with
// the rows themselves, which are now shared with the recipe panel's label.
