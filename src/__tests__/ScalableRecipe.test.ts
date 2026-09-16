import { describe, it, expect } from "vitest";
import { ScalableRecipe, formatScaledIngredient } from "@/lib/ScalableRecipe";
import {
  makeIngredientLines,
  makeScalableRecipe,
  scalableBaseIngredients,
  weighedYieldColumns,
} from "@/fixtures";
import { ingredientTexts } from "@/lib/recipeIngredients";

// The catalog-derived total is the only nutrition source, so any case that
// wants numbers has to supply one. The base document is 4 servings, so this whole-
// recipe total reads as 500 kcal / 10 g protein per serving. Fat is deliberately
// absent: the base schema's own (stored, unread) nutrition block does report it, and
// several tests below turn on it not showing through.
const covered = {
  total: { calories_kcal: 2000, protein_g: 40 },
  fullyCovered: true,
};

describe("ScalableRecipe — construction", () => {
  it("takes base servings from the column, with no parse", () => {
    expect(makeScalableRecipe().baseServings).toBe(4);
  });

  it("collapses range yield to midpoint", () => {
    const r = makeScalableRecipe({ servings_amount: 7 });
    expect(r.baseServings).toBe(7);
  });

  it("baseServings is null when the recipe has no serving count", () => {
    const r = makeScalableRecipe({ servings_amount: null });
    expect(r.baseServings).toBeNull();
  });

  it("initializes state to defaults", () => {
    const r = makeScalableRecipe();
    expect(r.state.ingredientScale).toBe(1);
    expect(r.state.nutritionPortions).toBeNull();
    expect(r.state.rangeAnchors).toEqual({});
  });

  it("accepts initial state via constructor", () => {
    const r = makeScalableRecipe({}, {
      ingredientScale: 2,
      nutritionPortions: 6,
      rangeAnchors: { 2: 4 },
    });
    expect(r.state.ingredientScale).toBe(2);
    expect(r.state.nutritionPortions).toBe(6);
    expect(r.state.rangeAnchors).toEqual({ 2: 4 });
  });

  it("carries each line's group name and id", () => {
    const r = makeScalableRecipe();
    expect(r.ingredients[4].group).toBe("Wet");
    expect(r.ingredients[5].group).toBe("Wet");
    expect(r.ingredients[4].id).toBe("ri-1-cup-butter");
  });

  it("leaves group undefined for lines in the nameless group", () => {
    const r = makeScalableRecipe();
    expect(r.ingredients[0].group).toBeUndefined();
  });

  it("groupedIngredients mirrors the recipe's groups in order", () => {
    const r = makeScalableRecipe();
    expect(r.groupedIngredients.map((g) => g.heading)).toEqual([null, "Wet"]);
    expect(r.groupedIngredients[1].items.map((i) => i.original)).toEqual([
      "1 cup butter",
      "1/4 cup sugar",
    ]);
    expect(makeScalableRecipe({ ingredients: [] }).groupedIngredients).toEqual([]);
  });

  it("retains unparseable ingredients with parsed: null", () => {
    const r = makeScalableRecipe();
    const salt = r.ingredients[3];
    expect(salt.parsed).toBeNull();
    expect(salt.scaledAmount).toBeNull();
    expect(salt.rest).toBe("salt to taste");
  });

  it("freezes state to prevent external mutation", () => {
    const r = makeScalableRecipe();
    expect(() => {
      (r.state as { ingredientScale: number }).ingredientScale = 99;
    }).toThrow();
  });
});

describe("ScalableRecipe — immutability", () => {
  it("scalePortionsTo returns a new instance, leaves original intact", () => {
    const a = makeScalableRecipe();
    const b = a.scalePortionsTo(8);
    expect(b).not.toBe(a);
    expect(a.state.ingredientScale).toBe(1);
    expect(b.state.ingredientScale).toBe(2);
  });

  it("splitPortions returns a new instance, leaves original intact", () => {
    const a = makeScalableRecipe();
    const b = a.splitPortions(8);
    expect(b).not.toBe(a);
    expect(a.state.nutritionPortions).toBeNull();
    expect(b.state.nutritionPortions).toBe(8);
  });

  it("anchorIngredientAmount returns a new instance", () => {
    const a = makeScalableRecipe();
    const b = a.anchorIngredientAmount(0, 4); // 2 cups flour → 4 cups
    expect(b).not.toBe(a);
    expect(a.state.ingredientScale).toBe(1);
    expect(b.state.ingredientScale).toBe(2);
  });

  it("returns same instance when operation would not change state", () => {
    const a = makeScalableRecipe();
    expect(a.scalePortionsTo(4)).toBe(a);
    expect(a.anchorIngredientAmount(0, 2)).toBe(a);
  });
});

describe("ScalableRecipe — scalePortionsTo", () => {
  it("scales ingredient amounts proportionally", () => {
    const r = makeScalableRecipe().scalePortionsTo(8);
    expect(r.ingredients[0].scaledAmount).toEqual({ kind: "single", value: 4 });
    expect(r.ingredients[1].scaledAmount).toEqual({ kind: "single", value: 1 });
  });

  it("scales range ingredients at both ends", () => {
    const r = makeScalableRecipe().scalePortionsTo(8);
    expect(r.ingredients[2].scaledAmount).toEqual({ kind: "range", min: 6, max: 10 });
  });

  it("updates currentServings", () => {
    expect(makeScalableRecipe().scalePortionsTo(8).currentServings).toBe(8);
  });

  it("noop (returns same instance) when baseServings is null", () => {
    const a = makeScalableRecipe({ servings_amount: null });
    expect(a.scalePortionsTo(8)).toBe(a);
  });

  it("clamps target to minimum 1 serving", () => {
    expect(makeScalableRecipe().scalePortionsTo(0).currentServings).toBe(1);
  });

  it("does not affect nutritionPortions state", () => {
    const r = makeScalableRecipe().splitPortions(6).scalePortionsTo(8);
    expect(r.state.nutritionPortions).toBe(6);
  });
});

describe("ScalableRecipe — splitPortions", () => {
  it("sets nutritionPortions to N", () => {
    expect(makeScalableRecipe().splitPortions(2).state.nutritionPortions).toBe(2);
  });

  it("does not affect ingredientScale", () => {
    const r = makeScalableRecipe().scalePortionsTo(8).splitPortions(2);
    expect(r.state.ingredientScale).toBe(2);
  });

  it("preserves rangeAnchors", () => {
    const r = makeScalableRecipe()
      .anchorIngredientAmount(2, 6)
      .splitPortions(2);
    expect(r.state.rangeAnchors).toEqual({ 2: 4 });
  });

  it("clamps portions to minimum 1", () => {
    expect(makeScalableRecipe().splitPortions(0).state.nutritionPortions).toBe(1);
  });

  it("nutritionLabel is 'per portion' when portions != currentServings", () => {
    expect(makeScalableRecipe().splitPortions(2).nutritionLabel).toBe("per portion");
  });

  it("nutritionLabel is 'per serving' when portions equal currentServings", () => {
    expect(makeScalableRecipe().splitPortions(4).nutritionLabel).toBe("per serving");
  });

  it("halves nutrition when split into twice as many portions", () => {
    // 2000 kcal / 40 g over 4 servings = 500 / 10 per serving; split to 8 → half.
    const r = makeScalableRecipe({ normalized: covered }).splitPortions(8);
    expect(r.nutritionMultiplier).toBe(0.5);
    expect(r.nutrition()?.calories).toEqual({ value: 250, unit: "kcal" });
    expect(r.nutrition()?.proteinContent).toEqual({ value: 5, unit: "g" });
  });
});

describe("ScalableRecipe — anchorIngredientAmount", () => {
  it("scales the recipe so the anchored ingredient hits the target", () => {
    const r = makeScalableRecipe().anchorIngredientAmount(0, 4);
    expect(r.state.ingredientScale).toBe(2);
    expect(r.ingredients[0].scaledAmount).toEqual({ kind: "single", value: 4 });
    expect(r.ingredients[1].scaledAmount).toEqual({ kind: "single", value: 1 });
  });

  it("accepts ref by ScaledIngredient object", () => {
    const a = makeScalableRecipe();
    const b = a.anchorIngredientAmount(a.ingredients[0], 4);
    expect(b.state.ingredientScale).toBe(2);
  });

  it("anchoring a range source converts it to single (collapses to the typed amount)", () => {
    const r = makeScalableRecipe().anchorIngredientAmount(2, 6);
    expect(r.state.ingredientScale).toBe(1.5);
    expect(r.state.rangeAnchors).toEqual({ 2: 4 });
    expect(r.ingredients[2].scaledAmount).toEqual({ kind: "single", value: 6 });
  });

  it("does not record a range anchor when source is single", () => {
    const r = makeScalableRecipe().anchorIngredientAmount(0, 4);
    expect(r.state.rangeAnchors).toEqual({});
  });

  it("after anchoring a range, scaling portions still scales that ingredient (as single)", () => {
    // base "3-5 cloves" (midpoint 4) → anchored to 6 (scale=1.5)
    // then portions 4→8 (scale=2.0) → display = 4 × 2 = 8 (single)
    const r = makeScalableRecipe()
      .anchorIngredientAmount(2, 6)
      .scalePortionsTo(8);
    expect(r.state.ingredientScale).toBe(2);
    expect(r.ingredients[2].scaledAmount).toEqual({ kind: "single", value: 8 });
  });

  it("range override persists when a different ingredient is later anchored", () => {
    // anchor range idx 2 to 6 (scale=1.5, override 2:4)
    // then anchor single idx 0 ("2 cups flour") to 4 (scale=2.0)
    // → idx 2 should still display as single, now 4 × 2 = 8
    const r = makeScalableRecipe()
      .anchorIngredientAmount(2, 6)
      .anchorIngredientAmount(0, 4);
    expect(r.state.ingredientScale).toBe(2);
    expect(r.state.rangeAnchors).toEqual({ 2: 4 });
    expect(r.ingredients[2].scaledAmount).toEqual({ kind: "single", value: 8 });
    expect(r.ingredients[0].scaledAmount).toEqual({ kind: "single", value: 4 });
  });

  it("other range ingredients remain ranges when an unrelated range is anchored", () => {
    // A list with two ranges; anchoring one should leave the other as a range.
    const twoRanges = makeScalableRecipe({
      schema: { name: "two-ranges" },
      ingredients: makeIngredientLines(["3-5 cloves garlic", "1-2 tsp cumin"]),
    }).anchorIngredientAmount(0, 8); // midpoint 4 → scale=2
    expect(twoRanges.state.rangeAnchors).toEqual({ 0: 4 });
    expect(twoRanges.ingredients[0].scaledAmount).toEqual({ kind: "single", value: 8 });
    expect(twoRanges.ingredients[1].scaledAmount).toEqual({ kind: "range", min: 2, max: 4 });
  });

  it("re-editing an already-anchored range recomputes from the original midpoint", () => {
    // First edit to 6 (scale=1.5), then to 12 (scale=3.0).
    // Override stays at the original midpoint (4), so display = 4 × 3 = 12.
    const r = makeScalableRecipe()
      .anchorIngredientAmount(2, 6)
      .anchorIngredientAmount(2, 12);
    expect(r.state.ingredientScale).toBe(3);
    expect(r.state.rangeAnchors).toEqual({ 2: 4 });
    expect(r.ingredients[2].scaledAmount).toEqual({ kind: "single", value: 12 });
  });

  it("anchoring a range to its midpoint records the override even when scale doesn't change", () => {
    // base scale=1, range "3-5" midpoint 4 → anchor to 4 keeps scale=1
    // but the ingredient must still collapse to single.
    const r = makeScalableRecipe().anchorIngredientAmount(2, 4);
    expect(r.state.ingredientScale).toBe(1);
    expect(r.state.rangeAnchors).toEqual({ 2: 4 });
    expect(r.ingredients[2].scaledAmount).toEqual({ kind: "single", value: 4 });
  });

  it("noop when target ingredient has no parsed amount", () => {
    const a = makeScalableRecipe();
    expect(a.anchorIngredientAmount(3, 2)).toBe(a);
  });

  it("noop on out-of-range index", () => {
    const a = makeScalableRecipe();
    expect(a.anchorIngredientAmount(99, 2)).toBe(a);
  });

  it("noop on non-positive or non-finite amount", () => {
    const a = makeScalableRecipe();
    expect(a.anchorIngredientAmount(0, 0)).toBe(a);
    expect(a.anchorIngredientAmount(0, -3)).toBe(a);
    expect(a.anchorIngredientAmount(0, NaN)).toBe(a);
  });
});

describe("ScalableRecipe — nutrition interaction", () => {
  it("nutrition unchanged when only scaling up servings", () => {
    const r = makeScalableRecipe({ normalized: covered }).scalePortionsTo(8);
    expect(r.nutritionMultiplier).toBe(1);
    expect(r.nutrition()?.calories).toEqual({ value: 500, unit: "kcal" });
  });

  it("nutrition multiplier reflects scale × split together", () => {
    // base=4, scale to 8 (cur=8), split to 4 → cur/dp = 8/4 = 2.
    const r = makeScalableRecipe({ normalized: covered })
      .scalePortionsTo(8)
      .splitPortions(4);
    expect(r.nutritionMultiplier).toBe(2);
    expect(r.nutrition()?.calories).toEqual({ value: 1000, unit: "kcal" });
  });

  it("hasNutrition reflects the catalog total, not the stored schema fields", () => {
    // The base schema carries a full nutrition block; on its own that buys nothing.
    expect(makeScalableRecipe().hasNutrition).toBe(false);
    expect(
      makeScalableRecipe({ normalized: covered }).hasNutrition,
    ).toBe(true);
  });

  it("nutrition() is null when the recipe was never normalized", () => {
    expect(makeScalableRecipe().nutrition()).toBeNull();
  });

  it("nutritionMultiplier is 1 when baseServings is null", () => {
    const r = makeScalableRecipe({ servings_amount: null }).splitPortions(2);
    expect(r.nutritionMultiplier).toBe(1);
  });
});

describe("ScalableRecipe — reset", () => {
  it("clears both scale and split state", () => {
    const r = makeScalableRecipe()
      .scalePortionsTo(8)
      .splitPortions(2)
      .reset();
    expect(r.state.ingredientScale).toBe(1);
    expect(r.state.nutritionPortions).toBeNull();
  });

  it("clears rangeAnchors", () => {
    const r = makeScalableRecipe()
      .anchorIngredientAmount(2, 6)
      .reset();
    expect(r.state.rangeAnchors).toEqual({});
    expect(r.ingredients[2].scaledAmount).toEqual({ kind: "range", min: 3, max: 5 });
  });

  it("returns same instance when already at default", () => {
    const a = makeScalableRecipe();
    expect(a.reset()).toBe(a);
  });
});

describe("ScalableRecipe — serving weight (the total weight columns)", () => {
  // weighedYieldColumns: 4 kebabs from 454 g → 454/4 = 113.5 g per serving.
  const weighed = () => makeScalableRecipe(weighedYieldColumns);

  it("servingWeight is total_weight_amount / baseServings at rest", () => {
    const r = weighed();
    expect(r.baseServings).toBe(4);
    expect(r.servingWeight).toEqual({ value: 113.5, unitText: "g" });
  });

  it("servingWeight stays constant when scaling servings (weight and count scale together)", () => {
    expect(weighed().scalePortionsTo(8).servingWeight?.value).toBe(
      113.5,
    );
  });

  it("servingWeight halves when split into twice as many portions", () => {
    expect(weighed().splitPortions(8).servingWeight?.value).toBe(
      56.75,
    );
  });

  it("servingWeight is null when the recipe carries no weight", () => {
    expect(makeScalableRecipe().servingWeight).toBeNull();
  });

  it("nutritionUnitLabel reads 'per <weight> serving' with a valueReference", () => {
    expect(weighed().nutritionUnitLabel).toBe("per 114 g serving");
  });

  it("nutritionUnitLabel switches the noun to 'portion' when split", () => {
    expect(weighed().splitPortions(8).nutritionUnitLabel).toBe(
      "per 57 g portion",
    );
  });

  it("nutritionUnitLabel falls back to the plain label without a weight", () => {
    expect(makeScalableRecipe().nutritionUnitLabel).toBe("per serving");
  });
});

describe("ScalableRecipe — nutrition views", () => {
  it("serves the catalog values when fully covered", () => {
    const n = makeScalableRecipe({ normalized: covered }).nutrition();
    expect(n?.calories).toEqual({ value: 500, unit: "kcal" });
    expect(n?.proteinContent).toEqual({ value: 10, unit: "g" });
  });

  it("never lets a stored schema nutrient fill a gap in the catalog total", () => {
    // The base schema reports fat; the catalog total doesn't. The stored field is
    // not a source, so the gap stays a gap rather than being quietly filled.
    const n = makeScalableRecipe({ normalized: covered }).nutrition();
    expect(n?.fatContent).toBeUndefined();
  });

  it("ingredientsNutrition() serves the normalized view even when not fully covered", () => {
    const r = makeScalableRecipe({
      normalized: { total: { calories_kcal: 2000 }, fullyCovered: false },
    });
    expect(r.ingredientsNutrition()?.calories).toEqual({ value: 500, unit: "kcal" });
  });

  it("ingredientsNutrition() is null without normalized data or servings", () => {
    expect(makeScalableRecipe().ingredientsNutrition()).toBeNull();
    expect(
      makeScalableRecipe({
        servings_amount: null,
        normalized: covered,
      }).ingredientsNutrition(),
    ).toBeNull();
  });

  it("keeps the scaling/split multiplier working", () => {
    const r = makeScalableRecipe({ normalized: covered }).splitPortions(8);
    expect(r.nutritionMultiplier).toBe(0.5);
    expect(r.nutrition()?.calories).toEqual({ value: 250, unit: "kcal" });
    expect(r.ingredientsNutrition()?.calories).toEqual({ value: 250, unit: "kcal" });
  });

  it("serves nothing when the list isn't fully covered", () => {
    // A partially-matched list reports no nutrition at all: it can't produce a
    // number anyone could trace to an ingredient, and the stored schema fields
    // are not allowed to stand in for one.
    const n = makeScalableRecipe({
      normalized: { total: { calories_kcal: 2000 }, fullyCovered: false },
    }).nutrition();
    expect(n).toBeNull();
  });

  it("serves nothing when baseServings is unknown", () => {
    const n = makeScalableRecipe({
      servings_amount: null,
      normalized: covered,
    }).nutrition();
    expect(n).toBeNull();
  });

  it("serves the catalog values even when the recipe has no stored fields", () => {
    const r = makeScalableRecipe({
      schema: { nutrition: undefined },
      normalized: covered,
    });
    expect(r.hasNutrition).toBe(true);
    expect(r.nutrition()?.calories).toEqual({ value: 500, unit: "kcal" });
  });

  // The serving descriptor is DERIVED from the servings unit now, not stored
  // beside the nutrients, so the panel's label and the published value cannot
  // disagree. It is not gated on nutrition resolving — it describes the recipe,
  // not the numbers.
  it("names one serving from the servings unit", () => {
    expect(makeScalableRecipe(weighedYieldColumns).servingSizeLabel).toBe("1 kebab");
    expect(makeScalableRecipe().servingSizeLabel).toBe("1 serving");
  });

  it("falls back to 'serving' when the recipe names no unit", () => {
    expect(makeScalableRecipe({ servings_unit: null }).servingSizeLabel).toBe(
      "1 serving",
    );
  });

  it("switches the noun to 'portion' when split, like nutritionUnitLabel", () => {
    expect(
      makeScalableRecipe(weighedYieldColumns).splitPortions(8).servingSizeLabel,
    ).toBe("1 portion");
  });

  it("carries the normalized total through scale/split/reset", () => {
    const r = makeScalableRecipe({ normalized: covered })
      .scalePortionsTo(8)
      .splitPortions(4)
      .reset();
    expect(r.normalized).toBe(covered);
    expect(r.nutrition()?.calories).toEqual({ value: 500, unit: "kcal" });
  });

  it("ignores the stored schema fields no matter how well-formed they are", () => {
    // These are perfectly parseable values, and they still resolve to nothing:
    // well-formedness is not what qualifies a number to be shown, provenance is.
    expect(
      makeScalableRecipe({
        schema: { nutrition: { calories: "200 kcal", fatContent: "5 g" } },
      }).nutrition(),
    ).toBeNull();
  });
});

describe("formatScaledIngredient", () => {
  // The base document is 4 servings; scalePortionsTo(8) is exactly 2x.
  const doubled = makeScalableRecipe().scalePortionsTo(8);
  const base = makeScalableRecipe();

  it("scales a whole amount and keeps the source's plural", () => {
    expect(formatScaledIngredient(doubled.ingredients[0])).toBe("4 cups flour");
  });

  it("scales a fraction to a whole number", () => {
    // "1/2 tsp salt" doubled.
    expect(formatScaledIngredient(doubled.ingredients[1])).toBe("1 tsp salt");
  });

  it("scales both ends of a range and keeps unit-less rest intact", () => {
    expect(formatScaledIngredient(doubled.ingredients[2])).toBe(
      "6-10 cloves garlic",
    );
  });

  it("returns unparseable lines untouched", () => {
    expect(formatScaledIngredient(doubled.ingredients[3])).toBe("salt to taste");
  });

  it("returns the original verbatim at base scale", () => {
    // Load-bearing: rebuilding is not an identity even at 1x, because
    // formatParsedAmount renders 1/2 as "0.5". Every base-scale line must come
    // back exactly as the recipe wrote it.
    expect(base.ingredients.map(formatScaledIngredient)).toEqual(
      ingredientTexts(scalableBaseIngredients),
    );
  });

  it("rebuilds an anchored range even when the scale lands back on 1", () => {
    // Anchoring "3-5 cloves garlic" to its own midpoint leaves ingredientScale
    // at 1 but collapses range -> single, so the amounts compare unequal and
    // the line still rebuilds.
    const anchored = makeScalableRecipe().anchorIngredientAmount(2, 4);
    expect(anchored.state.ingredientScale).toBe(1);
    expect(formatScaledIngredient(anchored.ingredients[2])).toBe(
      "4 cloves garlic",
    );
    // Untouched siblings still come back verbatim.
    expect(formatScaledIngredient(anchored.ingredients[0])).toBe(
      "2 cups flour",
    );
  });

  it("renders a scaled-down amount as a decimal", () => {
    const halved = makeScalableRecipe().scalePortionsTo(2);
    expect(formatScaledIngredient(halved.ingredients[0])).toBe("1 cups flour");
  });

  it("copies the recipe's own unit, not IngredientItem's promoted unit", () => {
    // The list promotes 1 tsp (~4.9 ml) past the 7 ml threshold to tbsp and
    // would show "0.34 tbsp"; the shopping list stays in the source's unit.
    expect(formatScaledIngredient(doubled.ingredients[1])).toBe("1 tsp salt");
  });

  it("carries the source's singular through a scale-up (known wart)", () => {
    // "1 cup butter" doubled reads "2 cup butter" — unitText is preserved
    // verbatim, and UNIT_DEFS has no singular/plural pair to switch on.
    expect(formatScaledIngredient(doubled.ingredients[4])).toBe(
      "2 cup butter",
    );
  });
});
