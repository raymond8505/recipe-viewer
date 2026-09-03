import { describe, expect, it } from "vitest";
import {
  computeLineNutrition,
  computeRecipeNutrition,
  explicitWeightGrams,
  gramsForLine,
  formatNutrientString,
  indexRowsForLines,
  lineComputationForSchema,
  resolveLineRow,
  normalizedTotalToPerServing,
  nutrientValuesToSchema,
  parseNutrientValue,
  perPortionNutrition,
  schemaNutritionToValues,
  scaleNutritionToGrams,
  scalePortionNutritionToPer100g,
  sumNutrition,
} from "@/lib/nutritionMath";
import type { IngredientRow, RecipeIngredientRow } from "@/types/ingredient";

// Minimal recipe_ingredients row builder for the recipe-wide aggregation tests.
function makeRow(
  position: number,
  overrides: Partial<RecipeIngredientRow> = {},
): RecipeIngredientRow {
  return {
    id: `ri-${position}`,
    recipe_id: "r-1",
    // Legacy by default — the tests that care about id-keying opt in.
    line_id: null,
    ingredient_id: `ing-${position}`,
    raw_text: overrides.raw_text ?? `${position} g thing`,
    quantity: 100,
    unit: "g",
    name_text: "thing",
    note: null,
    match_status: "matched",
    confidence: 1,
    position,
    estimated_grams: null,
    grams_source: null,
    ...overrides,
  };
}

function catalog(nutrition: IngredientRow["nutrition"]): IngredientRow {
  return {
    id: "ing-x",
    name: "thing",
    aliases: [],
    fdc_id: null,
    fdc_data_type: null,
    nutrition,
    density_g_per_ml: null,
    food_portions: null,
    source: "manual",
    created_at: "",
    updated_at: "",
  };
}

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

describe("scalePortionNutritionToPer100g", () => {
  it("scales values entered against a portion up to per-100g", () => {
    // 120 kcal in a 30 g serving → 400 kcal / 100 g
    expect(
      scalePortionNutritionToPer100g({ calories_kcal: 120, protein_g: 6 }, 30),
    ).toEqual({ calories_kcal: 400, protein_g: 20 });
  });

  it("is an identity transform for a 100 g portion", () => {
    const entered = { calories_kcal: 375, sodium_mg: 40 };
    expect(scalePortionNutritionToPer100g(entered, 100)).toEqual(entered);
  });

  it("rounds scaled values to 2 dp", () => {
    // 7 g protein in a 32 g serving → 21.875 → 21.88
    expect(scalePortionNutritionToPer100g({ protein_g: 7 }, 32)).toEqual({
      protein_g: 21.88,
    });
  });

  it("round-trips with scaleNutritionToGrams", () => {
    const per100g = scalePortionNutritionToPer100g({ calories_kcal: 60 }, 240);
    expect(scaleNutritionToGrams(per100g, 240).calories_kcal).toBeCloseTo(60, 6);
  });

  it("keeps key sparsity — absent keys stay absent", () => {
    const scaled = scalePortionNutritionToPer100g({ fiber_g: 2 }, 50);
    expect(scaled).toEqual({ fiber_g: 4 });
    expect("calories_kcal" in scaled).toBe(false);
  });

  it("returns an empty object for a non-positive portion (no divide-by-zero)", () => {
    expect(scalePortionNutritionToPer100g({ calories_kcal: 10 }, 0)).toEqual({});
    expect(scalePortionNutritionToPer100g({ calories_kcal: 10 }, -5)).toEqual({});
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

describe("resolveLineRow", () => {
  it("joins on the line's id, which IS the row's primary key", () => {
    const rows = [makeRow(0, { id: "ri-0" }), makeRow(1, { id: "ri-1" })];
    // Second row, first position: order in the array is not the join.
    const resolved = resolveLineRow(
      { name: "1 tsp cumin", id: "ri-1" },
      indexRowsForLines(rows),
    );
    expect(resolved.row?.id).toBe("ri-1");
  });

  // An id with no row is a genuinely new line. Falling back to position would
  // hand it whichever row happens to sit at that index.
  it("does not fall back to position for a line that has an id", () => {
    const rows = [makeRow(0, { id: "ri-0" })];
    expect(
      resolveLineRow({ name: "new", id: "ri-unknown" }, indexRowsForLines(rows)),
    ).toEqual({ row: null });
  });

  it("resolves nothing for a line that has never been persisted", () => {
    const rows = [makeRow(0, { id: "ri-0" })];
    expect(resolveLineRow("1 tsp cumin", indexRowsForLines(rows))).toEqual({
      row: null,
    });
  });
});

describe("lineComputationForSchema", () => {
  it("excludes a line with no row as stale", () => {
    expect(
      lineComputationForSchema({ row: null }, null),
    ).toEqual({ kind: "excluded", reason: "stale" });
  });

  // The whole point of keying a line to its row: the words are display copy,
  // the id is the identity. Rewording must not cost the line its association
  // or its place in the totals — only the curator changes a match.
  it("computes normally for an id-joined row whose stored text has moved", () => {
    const row = makeRow(0, {
      raw_text: "100 g Acme brand thing",
      quantity: 100,
      unit: "g",
    });
    expect(
      lineComputationForSchema({ row }, catalog({ calories_kcal: 50 })),
    ).toMatchObject({ kind: "ok", nutrition: { calories_kcal: 50 } });
  });

  it("defers to computeLineNutrition whenever there is a row", () => {
    const row = makeRow(0, { raw_text: "100 g thing", quantity: 100, unit: "g" });
    expect(
      lineComputationForSchema({ row }, catalog({ calories_kcal: 50 })),
    ).toMatchObject({ kind: "ok", nutrition: { calories_kcal: 50 } });
  });
});

describe("computeRecipeNutrition", () => {
  it("sums matched lines and reports full coverage", () => {
    const rows = [
      makeRow(0, { id: "ri-0", raw_text: "100 g thing", ingredient_id: "a" }),
      makeRow(1, { id: "ri-1", raw_text: "100 g thing", ingredient_id: "b" }),
    ];
    const schema = rows.map((row) => ({ name: row.raw_text, id: row.id }));
    const byId = new Map([
      ["a", catalog({ calories_kcal: 100, protein_g: 5 })],
      ["b", catalog({ calories_kcal: 50 })],
    ]);
    const result = computeRecipeNutrition(schema, rows, byId);
    expect(result.total).toEqual({ calories_kcal: 150, protein_g: 5 });
    expect(result).toMatchObject({
      lineCount: 2,
      excludedCount: 0,
      hasStaleLines: false,
      fullyCovered: true,
    });
  });

  it("is not fully covered when a line is unmatched", () => {
    const rows = [
      makeRow(0, { id: "ri-0", raw_text: "100 g thing", ingredient_id: "a" }),
      makeRow(1, {
        id: "ri-1",
        raw_text: "salt to taste",
        ingredient_id: null,
        match_status: "unmatched",
      }),
    ];
    const schema = rows.map((row) => ({ name: row.raw_text, id: row.id }));
    const byId = new Map([["a", catalog({ calories_kcal: 100 })]]);
    const result = computeRecipeNutrition(schema, rows, byId);
    expect(result.total).toEqual({ calories_kcal: 100 });
    expect(result).toMatchObject({ excludedCount: 1, fullyCovered: false });
  });

  // A line whose id resolves to no row has never been normalized, so there is
  // nothing to compute for it and the recipe is not fully covered.
  it("is not fully covered when a line resolves to no row", () => {
    const schema = [{ name: "2 cups flour", id: "ri-gone" }];
    const rows = [
      makeRow(0, { id: "ri-0", raw_text: "1 cup flour", ingredient_id: "a" }),
    ];
    const byId = new Map([["a", catalog({ calories_kcal: 100 })]]);
    const result = computeRecipeNutrition(schema, rows, byId);
    expect(result).toMatchObject({
      hasStaleLines: true,
      excludedCount: 1,
      fullyCovered: false,
    });
  });

  // Once the line has an id, a reword is invisible to the totals — the row
  // followed the edit and the association is untouched.
  it("stays fully covered when an id-keyed line is reworded", () => {
    const schema = [{ name: "100 g thing", id: "ri-0" }];
    const rows = [
      makeRow(0, {
        id: "ri-0",
        raw_text: "100 g Acme brand thing",
        quantity: 100,
        unit: "g",
        ingredient_id: "a",
      }),
    ];
    const byId = new Map([["a", catalog({ calories_kcal: 100 })]]);
    const result = computeRecipeNutrition(schema, rows, byId);
    expect(result.total).toEqual({ calories_kcal: 100 });
    expect(result).toMatchObject({
      hasStaleLines: false,
      excludedCount: 0,
      fullyCovered: true,
    });
  });

  it("is not fully covered for a recipe with no ingredient lines", () => {
    expect(computeRecipeNutrition([], [], new Map()).fullyCovered).toBe(false);
  });
});

describe("normalizedTotalToPerServing", () => {
  it("maps snake_case totals to per-serving NutrientValues with units", () => {
    expect(
      normalizedTotalToPerServing(
        { calories_kcal: 2000, protein_g: 40, sodium_mg: 3200 },
        4,
      ),
    ).toEqual({
      calories: { value: 500, unit: "kcal" },
      proteinContent: { value: 10, unit: "g" },
      sodiumContent: { value: 800, unit: "mg" },
    });
  });

  it("keeps full precision — rounding is deferred to the boundaries", () => {
    expect(normalizedTotalToPerServing({ fat_g: 25 }, 4)).toEqual({
      fatContent: { value: 6.25, unit: "g" },
    });
  });

  it("omits nutrients with no Schema.org slot (calcium/iron/potassium)", () => {
    const out = normalizedTotalToPerServing(
      { calcium_mg: 400, iron_mg: 8, potassium_mg: 100 },
      2,
    );
    expect(out).toEqual({});
  });

  it("returns an empty object for non-positive servings", () => {
    expect(normalizedTotalToPerServing({ calories_kcal: 100 }, 0)).toEqual({});
  });
});

describe("parseNutrientValue", () => {
  it("parses a spaced unit", () => {
    expect(parseNutrientValue("350 kcal")).toEqual({ value: 350, unit: "kcal" });
  });

  it("parses an attached unit", () => {
    expect(parseNutrientValue("20g")).toEqual({ value: 20, unit: "g" });
  });

  it("parses a bare number to an empty unit", () => {
    expect(parseNutrientValue("250")).toEqual({ value: 250, unit: "" });
  });

  it("parses decimals", () => {
    expect(parseNutrientValue("0.5 mg")).toEqual({ value: 0.5, unit: "mg" });
  });

  it("returns null for strings without a leading number", () => {
    expect(parseNutrientValue("unknown")).toBeNull();
    expect(parseNutrientValue("about 300 kcal")).toBeNull();
  });
});

describe("formatNutrientString", () => {
  it("prints integers without a decimal", () => {
    expect(formatNutrientString({ value: 480, unit: "kcal" })).toBe("480 kcal");
  });

  it("rounds to one decimal place when fractional", () => {
    expect(formatNutrientString({ value: 6.25, unit: "g" })).toBe("6.3 g");
  });

  it("strips a trailing zero decimal", () => {
    expect(formatNutrientString({ value: 19.999, unit: "g" })).toBe("20 g");
  });

  it("prints bare when the unit is empty", () => {
    expect(formatNutrientString({ value: 250, unit: "" })).toBe("250");
  });
});

describe("schemaNutritionToValues / nutrientValuesToSchema", () => {
  it("round-trips wire strings through object values", () => {
    const wire = {
      servingSize: "1 slice",
      calories: "350 kcal",
      proteinContent: "20g",
      fiberContent: "0.5 g",
    };
    const values = schemaNutritionToValues(wire);
    expect(values).toEqual({
      servingSize: "1 slice",
      calories: { value: 350, unit: "kcal" },
      proteinContent: { value: 20, unit: "g" },
      fiberContent: { value: 0.5, unit: "g" },
    });
    // Attached units come back spaced — the wire format is normalized.
    expect(nutrientValuesToSchema(values)).toEqual({
      servingSize: "1 slice",
      calories: "350 kcal",
      proteinContent: "20 g",
      fiberContent: "0.5 g",
    });
  });

  it("omits unparseable fields at the parse boundary", () => {
    expect(
      schemaNutritionToValues({ calories: "unknown", fatContent: "5 g" }),
    ).toEqual({ fatContent: { value: 5, unit: "g" } });
  });

  it("rounds to 1dp at the stringify boundary", () => {
    expect(
      nutrientValuesToSchema({ fatContent: { value: 6.6666, unit: "g" } }),
    ).toEqual({ fatContent: "6.7 g" });
  });
});

