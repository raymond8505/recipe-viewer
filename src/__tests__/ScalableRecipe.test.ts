import { describe, it, expect } from "vitest";
import { ScalableRecipe } from "@/lib/ScalableRecipe";
import type { SchemaRecipe } from "@/types/recipe";

const baseSchema: SchemaRecipe = {
  name: "Test Recipe",
  recipeYield: "4 servings",
  recipeIngredient: [
    "2 cups flour",
    "1/2 tsp salt",
    "3-5 cloves garlic",
    "salt to taste",
    { name: "1 cup butter", group: "Wet" },
    { name: "1/4 cup sugar", group: "Wet" },
  ],
  nutrition: {
    "@type": "NutritionInformation",
    calories: "200 kcal",
    proteinContent: "10 g",
    fatContent: "5 g",
  },
};

describe("ScalableRecipe — construction", () => {
  it("parses base servings from recipeYield", () => {
    expect(new ScalableRecipe(baseSchema).baseServings).toBe(4);
  });

  it("collapses range yield to midpoint", () => {
    const r = new ScalableRecipe({ ...baseSchema, recipeYield: "6-8 servings" });
    expect(r.baseServings).toBe(7);
  });

  it("baseServings is null when recipeYield is missing", () => {
    const r = new ScalableRecipe({ ...baseSchema, recipeYield: undefined });
    expect(r.baseServings).toBeNull();
  });

  it("initializes state to defaults", () => {
    const r = new ScalableRecipe(baseSchema);
    expect(r.state.ingredientScale).toBe(1);
    expect(r.state.nutritionPortions).toBeNull();
  });

  it("accepts initial state via constructor", () => {
    const r = new ScalableRecipe(baseSchema, { ingredientScale: 2, nutritionPortions: 6 });
    expect(r.state.ingredientScale).toBe(2);
    expect(r.state.nutritionPortions).toBe(6);
  });

  it("preserves group on object-form ingredients", () => {
    const r = new ScalableRecipe(baseSchema);
    expect(r.ingredients[4].group).toBe("Wet");
    expect(r.ingredients[5].group).toBe("Wet");
  });

  it("leaves group undefined on string-form ingredients", () => {
    const r = new ScalableRecipe(baseSchema);
    expect(r.ingredients[0].group).toBeUndefined();
  });

  it("retains unparseable ingredients with parsed: null", () => {
    const r = new ScalableRecipe(baseSchema);
    const salt = r.ingredients[3];
    expect(salt.parsed).toBeNull();
    expect(salt.scaledAmount).toBeNull();
    expect(salt.rest).toBe("salt to taste");
  });

  it("freezes state to prevent external mutation", () => {
    const r = new ScalableRecipe(baseSchema);
    expect(() => {
      (r.state as { ingredientScale: number }).ingredientScale = 99;
    }).toThrow();
  });
});

describe("ScalableRecipe — immutability", () => {
  it("scalePortionsTo returns a new instance, leaves original intact", () => {
    const a = new ScalableRecipe(baseSchema);
    const b = a.scalePortionsTo(8);
    expect(b).not.toBe(a);
    expect(a.state.ingredientScale).toBe(1);
    expect(b.state.ingredientScale).toBe(2);
  });

  it("splitPortions returns a new instance, leaves original intact", () => {
    const a = new ScalableRecipe(baseSchema);
    const b = a.splitPortions(8);
    expect(b).not.toBe(a);
    expect(a.state.nutritionPortions).toBeNull();
    expect(b.state.nutritionPortions).toBe(8);
  });

  it("anchorIngredientAmount returns a new instance", () => {
    const a = new ScalableRecipe(baseSchema);
    const b = a.anchorIngredientAmount(0, 4); // 2 cups flour → 4 cups
    expect(b).not.toBe(a);
    expect(a.state.ingredientScale).toBe(1);
    expect(b.state.ingredientScale).toBe(2);
  });

  it("returns same instance when operation would not change state", () => {
    const a = new ScalableRecipe(baseSchema);
    expect(a.scalePortionsTo(4)).toBe(a);
    expect(a.anchorIngredientAmount(0, 2)).toBe(a);
  });
});

describe("ScalableRecipe — scalePortionsTo", () => {
  it("scales ingredient amounts proportionally", () => {
    const r = new ScalableRecipe(baseSchema).scalePortionsTo(8);
    expect(r.ingredients[0].scaledAmount).toEqual({ kind: "single", value: 4 });
    expect(r.ingredients[1].scaledAmount).toEqual({ kind: "single", value: 1 });
  });

  it("scales range ingredients at both ends", () => {
    const r = new ScalableRecipe(baseSchema).scalePortionsTo(8);
    expect(r.ingredients[2].scaledAmount).toEqual({ kind: "range", min: 6, max: 10 });
  });

  it("updates currentServings", () => {
    expect(new ScalableRecipe(baseSchema).scalePortionsTo(8).currentServings).toBe(8);
  });

  it("noop (returns same instance) when baseServings is null", () => {
    const a = new ScalableRecipe({ ...baseSchema, recipeYield: undefined });
    expect(a.scalePortionsTo(8)).toBe(a);
  });

  it("clamps target to minimum 1 serving", () => {
    expect(new ScalableRecipe(baseSchema).scalePortionsTo(0).currentServings).toBe(1);
  });

  it("does not affect nutritionPortions state", () => {
    const r = new ScalableRecipe(baseSchema).splitPortions(6).scalePortionsTo(8);
    expect(r.state.nutritionPortions).toBe(6);
  });
});

describe("ScalableRecipe — splitPortions", () => {
  it("sets nutritionPortions to N", () => {
    expect(new ScalableRecipe(baseSchema).splitPortions(2).state.nutritionPortions).toBe(2);
  });

  it("does not affect ingredientScale", () => {
    const r = new ScalableRecipe(baseSchema).scalePortionsTo(8).splitPortions(2);
    expect(r.state.ingredientScale).toBe(2);
  });

  it("clamps portions to minimum 1", () => {
    expect(new ScalableRecipe(baseSchema).splitPortions(0).state.nutritionPortions).toBe(1);
  });

  it("nutritionLabel is 'per portion' when portions != currentServings", () => {
    expect(new ScalableRecipe(baseSchema).splitPortions(2).nutritionLabel).toBe("per portion");
  });

  it("nutritionLabel is 'per serving' when portions equal currentServings", () => {
    expect(new ScalableRecipe(baseSchema).splitPortions(4).nutritionLabel).toBe("per serving");
  });

  it("halves nutrition when split into twice as many portions", () => {
    const r = new ScalableRecipe(baseSchema).splitPortions(8);
    expect(r.nutritionMultiplier).toBe(0.5);
    expect(r.nutrition?.calories).toBe("100 kcal");
    expect(r.nutrition?.proteinContent).toBe("5 g");
  });
});

describe("ScalableRecipe — anchorIngredientAmount", () => {
  it("scales the recipe so the anchored ingredient hits the target", () => {
    const r = new ScalableRecipe(baseSchema).anchorIngredientAmount(0, 4);
    expect(r.state.ingredientScale).toBe(2);
    expect(r.ingredients[0].scaledAmount).toEqual({ kind: "single", value: 4 });
    expect(r.ingredients[1].scaledAmount).toEqual({ kind: "single", value: 1 });
  });

  it("accepts ref by ScaledIngredient object", () => {
    const a = new ScalableRecipe(baseSchema);
    const b = a.anchorIngredientAmount(a.ingredients[0], 4);
    expect(b.state.ingredientScale).toBe(2);
  });

  it("anchors range source using midpoint", () => {
    const r = new ScalableRecipe(baseSchema).anchorIngredientAmount(2, 6);
    expect(r.state.ingredientScale).toBe(1.5);
    expect(r.ingredients[2].scaledAmount).toEqual({ kind: "range", min: 4.5, max: 7.5 });
  });

  it("noop when target ingredient has no parsed amount", () => {
    const a = new ScalableRecipe(baseSchema);
    expect(a.anchorIngredientAmount(3, 2)).toBe(a);
  });

  it("noop on out-of-range index", () => {
    const a = new ScalableRecipe(baseSchema);
    expect(a.anchorIngredientAmount(99, 2)).toBe(a);
  });

  it("noop on non-positive or non-finite amount", () => {
    const a = new ScalableRecipe(baseSchema);
    expect(a.anchorIngredientAmount(0, 0)).toBe(a);
    expect(a.anchorIngredientAmount(0, -3)).toBe(a);
    expect(a.anchorIngredientAmount(0, NaN)).toBe(a);
  });
});

describe("ScalableRecipe — nutrition interaction", () => {
  it("nutrition unchanged when only scaling up servings", () => {
    const r = new ScalableRecipe(baseSchema).scalePortionsTo(8);
    expect(r.nutritionMultiplier).toBe(1);
    expect(r.nutrition?.calories).toBe("200 kcal");
  });

  it("nutrition multiplier reflects scale × split together", () => {
    // base=4, scale to 8 (cur=8), split to 4 → cur/dp = 8/4 = 2.
    const r = new ScalableRecipe(baseSchema).scalePortionsTo(8).splitPortions(4);
    expect(r.nutritionMultiplier).toBe(2);
    expect(r.nutrition?.calories).toBe("400 kcal");
  });

  it("hasNutrition reflects schema content", () => {
    expect(new ScalableRecipe(baseSchema).hasNutrition).toBe(true);
    expect(new ScalableRecipe({ ...baseSchema, nutrition: undefined }).hasNutrition).toBe(false);
  });

  it("nutrition is null when schema has no nutrition", () => {
    expect(new ScalableRecipe({ ...baseSchema, nutrition: undefined }).nutrition).toBeNull();
  });

  it("nutritionMultiplier is 1 when baseServings is null", () => {
    const r = new ScalableRecipe({ ...baseSchema, recipeYield: undefined }).splitPortions(2);
    expect(r.nutritionMultiplier).toBe(1);
  });
});

describe("ScalableRecipe — reset", () => {
  it("clears both scale and split state", () => {
    const r = new ScalableRecipe(baseSchema)
      .scalePortionsTo(8)
      .splitPortions(2)
      .reset();
    expect(r.state.ingredientScale).toBe(1);
    expect(r.state.nutritionPortions).toBeNull();
  });

  it("returns same instance when already at default", () => {
    const a = new ScalableRecipe(baseSchema);
    expect(a.reset()).toBe(a);
  });
});
