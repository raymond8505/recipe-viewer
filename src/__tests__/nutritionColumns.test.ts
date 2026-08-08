import { describe, it, expect } from "vitest";
import {
  NUTRITION_BASIS_GRAMS,
  NUTRITION_BASIS_LABEL,
  NUTRITION_COLUMNS,
  PRIMARY_NUTRITION_COLUMNS,
  nutritionLabel,
} from "@/components/ingredients/nutritionColumns";
import { NUTRITION_FIELDS } from "@/lib/nutritionFields";
import type { IngredientNutrition } from "@/types/ingredient";

// The nutrient labeling system is the single source of what each value is
// called across the manager table header, the detail drawer, and every
// aria-label. These tests pin that mapping so a name can't silently drift
// (e.g. back to the USDA-verbose "Dietary fiber") and break the consistency.

// The exact, expected label for every catalog nutrient. Keyed by the
// IngredientNutrition field so a new/renamed nutrient forces a conscious update.
const EXPECTED_LABELS: Record<keyof IngredientNutrition, string> = {
  calories_kcal: "Calories (kcal)",
  protein_g: "Protein (g)",
  fat_g: "Fat (g)",
  saturated_fat_g: "Saturated fat (g)",
  carbs_g: "Carbs (g)",
  fiber_g: "Fiber (g)",
  sugars_g: "Sugars (g)",
  sodium_mg: "Sodium (mg)",
  cholesterol_mg: "Cholesterol (mg)",
  calcium_mg: "Calcium (mg)",
  iron_mg: "Iron (mg)",
  potassium_mg: "Potassium (mg)",
};

describe("nutritionLabel", () => {
  it("composes '<name> (<unit>)' deterministically", () => {
    expect(nutritionLabel({ key: "fiber_g", name: "Fiber", unit: "g" })).toBe(
      "Fiber (g)",
    );
    expect(
      nutritionLabel({ key: "calories_kcal", name: "Calories", unit: "kcal" }),
    ).toBe("Calories (kcal)");
  });

  it("labels every catalog column with its exact expected string", () => {
    for (const col of NUTRITION_COLUMNS) {
      expect(nutritionLabel(col)).toBe(EXPECTED_LABELS[col.key]);
    }
  });

  it("covers exactly the catalog columns — no missing or stray nutrient", () => {
    expect(NUTRITION_COLUMNS.map((c) => c.key).sort()).toEqual(
      (Object.keys(EXPECTED_LABELS) as (keyof IngredientNutrition)[]).sort(),
    );
  });

  it("follows NUTRITION_FIELDS' order, so the UI and the MCP prose agree", () => {
    expect(NUTRITION_COLUMNS.map((c) => c.key)).toEqual([...NUTRITION_FIELDS]);
  });

  it("never resurfaces the verbose USDA names", () => {
    const labels = NUTRITION_COLUMNS.map(nutritionLabel).join(" | ");
    expect(labels).not.toMatch(/Dietary|Total fat|Carbohydrate/);
  });

  it("gives every column a non-empty name and unit", () => {
    for (const col of NUTRITION_COLUMNS) {
      expect(col.name).toBeTruthy();
      expect(col.unit).toBeTruthy();
    }
  });
});

describe("PRIMARY_NUTRITION_COLUMNS", () => {
  it("is the six primary nutrients in reading order", () => {
    expect(PRIMARY_NUTRITION_COLUMNS.map((c) => c.key)).toEqual([
      "calories_kcal",
      "protein_g",
      "carbs_g",
      "fat_g",
      "fiber_g",
      "sodium_mg",
    ]);
  });

  it("reuses the catalog column objects (same labels as the drawer)", () => {
    for (const col of PRIMARY_NUTRITION_COLUMNS) {
      expect(NUTRITION_COLUMNS).toContain(col);
    }
  });
});

describe("nutrition basis", () => {
  it("is a per-100 g label derived from the gram const", () => {
    expect(NUTRITION_BASIS_GRAMS).toBe(100);
    expect(NUTRITION_BASIS_LABEL).toBe("per 100 g");
  });
});
