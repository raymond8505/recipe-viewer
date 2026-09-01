import { describe, expect, it } from "vitest";
import {
  ingredientNutritionRows,
  recipeNutritionRows,
  type LabelData,
} from "@/components/nutrition/labelRows";
import { NUTRITION_COLUMNS } from "@/components/ingredients/nutritionColumns";
import { NUTRIENT_FIELDS, schemaNutritionToValues } from "@/lib/nutritionMath";
import { fullNutrientValues, ingredientFixtures } from "@/fixtures";

/** Every row on a label, in the order it renders. */
const allRows = (d: LabelData) => [...d.fats, ...d.carbs, ...d.micros];

describe("recipeNutritionRows", () => {
  it("orders rows as the FDA panel does, fats column then carbs column", () => {
    // Stacked, these two groups read as one continuous list — so their order is
    // also the vertical label's order.
    const data = recipeNutritionRows(fullNutrientValues);
    expect(data.fats.map((r) => r.name)).toEqual([
      "Total Fat",
      "Saturated Fat",
      "Unsaturated Fat",
      "Cholesterol",
      "Sodium",
    ]);
    expect(data.carbs.map((r) => r.name)).toEqual([
      "Total Carbohydrate",
      "Dietary Fiber",
      "Total Sugars",
      "Protein",
    ]);
  });

  it("covers every NutrientField exactly once across calories and rows", () => {
    // The recipe label is the only place all ten are visible, so a new
    // NutrientField that never reaches a row would be silently unreachable.
    const data = recipeNutritionRows(fullNutrientValues);
    const valued = allRows(data).filter((r) => r.value != null);
    expect(valued).toHaveLength(NUTRIENT_FIELDS.length - 1); // minus calories
    expect(data.calories).toEqual({ value: 520, unit: "kcal" });
    const keys = allRows(data).map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("emits no mineral rows at all", () => {
    // They have no Schema.org slot, so the recipe path can never fill them —
    // and since untracked nutrients aren't rendered, permanently-empty rows
    // would be pure dead weight.
    expect(recipeNutritionRows(fullNutrientValues).micros).toEqual([]);
  });

  it("marks a nutrient the recipe doesn't carry as absent, not zero", () => {
    const data = recipeNutritionRows(
      schemaNutritionToValues({ calories: "350 kcal" }),
    );
    expect(allRows(data).every((r) => r.value === null)).toBe(true);
  });
});

describe("ingredientNutritionRows", () => {
  const cumin = ingredientFixtures[0].nutrition!;

  it("covers every catalog nutrient exactly once across calories and rows", () => {
    // Replaces the old nutritionFacts.test.ts coverage check: a nutrient added
    // to the catalog but missing from the label would go unnoticed otherwise.
    const data = ingredientNutritionRows(cumin);
    const labelKeys = ["calories_kcal", ...allRows(data).map((r) => r.key)];
    expect(new Set(labelKeys).size).toBe(labelKeys.length);
    expect(labelKeys).toHaveLength(NUTRITION_COLUMNS.length);
  });

  it("omits the unsaturated-fat row the catalog has no column for", () => {
    // A permanently-empty line would be noise on a screen whose job is checking
    // entered values against a package label.
    const data = ingredientNutritionRows(cumin);
    expect(allRows(data).map((r) => r.key)).not.toContain("unsaturatedFat");
  });

  it("attaches each nutrient's unit from the catalog basis", () => {
    const data = ingredientNutritionRows({ sodium_mg: 168, protein_g: 17.8 });
    const byKey = new Map(allRows(data).map((r) => [r.key, r.value]));
    expect(byKey.get("sodium")).toEqual({ value: 168, unit: "mg" });
    expect(byKey.get("protein")).toEqual({ value: 17.8, unit: "g" });
    expect(byKey.get("fat")).toBeNull();
  });
});

describe("shared FDA wording", () => {
  it("names a nutrient identically on both labels", () => {
    // The two labels are fed by different type systems but must not drift —
    // this is what the shared SLOTS table buys, structurally. Only the keys
    // both sides carry can be compared: the minerals are catalog-only and
    // unsaturated fat is recipe-only.
    const recipe = new Map(
      allRows(recipeNutritionRows(fullNutrientValues)).map((r) => [r.key, r.name]),
    );
    const shared = allRows(ingredientNutritionRows(cuminLike)).filter((row) =>
      recipe.has(row.key),
    );
    expect(shared.length).toBeGreaterThan(0);
    for (const row of shared) {
      expect(recipe.get(row.key), `name drift on ${row.key}`).toBe(row.name);
    }
  });

  it("gives the tabular columns FDA abbreviations", () => {
    const byKey = new Map(
      allRows(recipeNutritionRows(fullNutrientValues)).map((r) => [r.key, r.short]),
    );
    expect(byKey.get("saturatedFat")).toBe("Sat. Fat");
    expect(byKey.get("cholesterol")).toBe("Cholest.");
    expect(byKey.get("carbohydrate")).toBe("Total Carb.");
  });
});

const cuminLike = { calories_kcal: 375, protein_g: 17.8, sodium_mg: 168 };
