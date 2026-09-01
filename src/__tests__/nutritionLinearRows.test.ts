import { describe, expect, it } from "vitest";
import {
  LINEAR_NUTRIENT_ORDER,
  LINEAR_NUTRIENT_ROWS,
} from "@/components/nutritionLinearRows";
import { NUTRITION_LABEL_ROWS } from "@/components/ingredients/nutritionFacts";
import { NUTRIENT_FIELDS, type NutrientField } from "@/lib/nutritionMath";
import type { IngredientNutrition } from "@/types/ingredient";

describe("LINEAR_NUTRIENT_ORDER", () => {
  // Membership is a compile-time guarantee (exhaustiveKeys names a missing
  // field); order is not type-visible, so it's pinned here — same rationale as
  // the NUTRITION_FIELDS order test.
  it("is the FDA panel order with Calories leading the run", () => {
    expect(LINEAR_NUTRIENT_ORDER).toEqual([
      "calories",
      "fatContent",
      "saturatedFatContent",
      "unsaturatedFatContent",
      "cholesterolContent",
      "sodiumContent",
      "carbohydrateContent",
      "fiberContent",
      "sugarContent",
      "proteinContent",
    ]);
  });

  it("covers every NutrientField exactly once", () => {
    const keys = LINEAR_NUTRIENT_ROWS.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...NUTRIENT_FIELDS].sort());
  });
});

describe("LINEAR_NUTRIENT_ROWS", () => {
  it("marks exactly the sub-nutrients", () => {
    // The linear format has no indent, so `sub` is the only hierarchy signal.
    expect(
      LINEAR_NUTRIENT_ROWS.filter((row) => row.sub).map((row) => row.key),
    ).toEqual([
      "saturatedFatContent",
      "unsaturatedFatContent",
      "fiberContent",
      "sugarContent",
    ]);
  });

  // Both labels use FDA panel wording, and a user may see them minutes apart
  // (the catalog editor's vertical label, then this one on the recipe). They're
  // keyed by different type systems so they can't share a constant — this keeps
  // the names from drifting instead.
  //
  // Two nutrients are deliberately absent from the pairing:
  //   - `calories` — the vertical label pulls it out as the big display number,
  //     so it has no NUTRITION_LABEL_ROWS entry to compare against;
  //   - `unsaturatedFatContent` — Schema.org-only, with no IngredientNutrition
  //     key and no FDA counterpart (see the note in nutritionLinearRows.ts).
  const PAIRED: Partial<Record<NutrientField, keyof IngredientNutrition>> = {
    fatContent: "fat_g",
    saturatedFatContent: "saturated_fat_g",
    cholesterolContent: "cholesterol_mg",
    sodiumContent: "sodium_mg",
    carbohydrateContent: "carbs_g",
    fiberContent: "fiber_g",
    sugarContent: "sugars_g",
    proteinContent: "protein_g",
  };

  it("uses the same FDA wording as the vertical catalog label", () => {
    for (const [field, snakeKey] of Object.entries(PAIRED) as [
      NutrientField,
      keyof IngredientNutrition,
    ][]) {
      const linear = LINEAR_NUTRIENT_ROWS.find((row) => row.key === field);
      const vertical = NUTRITION_LABEL_ROWS.find((row) => row.key === snakeKey);
      expect(vertical, `no vertical row for ${snakeKey}`).toBeDefined();
      expect(linear?.name, `name drift on ${field}`).toBe(vertical!.name);
    }
  });

  it("pairs every nutrient the two labels share", () => {
    // Guards the exclusion list itself: if a NutrientField gains an
    // IngredientNutrition counterpart, it must join PAIRED rather than sit
    // silently unchecked.
    const unpaired = LINEAR_NUTRIENT_ROWS.map((row) => row.key).filter(
      (key) => !(key in PAIRED),
    );
    expect(unpaired).toEqual(["calories", "unsaturatedFatContent"]);
  });
});
