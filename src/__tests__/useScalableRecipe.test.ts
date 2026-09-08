import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScalableRecipe } from "@/hooks/useScalableRecipe";
import { makeIngredientLines } from "@/fixtures";
import type { RecipeDocument } from "@/types/recipe";

const doc: RecipeDocument = {
  schema: {
    name: "Test",
    recipeYield: "4 servings",
    nutrition: { calories: "200 kcal" },
  },
  ingredients: makeIngredientLines(["2 cups flour", "3-5 cloves garlic"]),
  prep_time: null,
  cook_time: null,
  total_time: null,
};

describe("useScalableRecipe", () => {
  it("starts with a default-state recipe matching the document", () => {
    const { result } = renderHook(() => useScalableRecipe(doc));
    expect(result.current.recipe.baseServings).toBe(4);
    expect(result.current.recipe.currentServings).toBe(4);
    expect(result.current.recipe.state.ingredientScale).toBe(1);
    expect(result.current.recipe.state.nutritionPortions).toBeNull();
    expect(result.current.recipe.ingredients).toHaveLength(2);
  });

  it("scalePortionsTo updates currentServings", () => {
    const { result } = renderHook(() => useScalableRecipe(doc));
    act(() => result.current.scalePortionsTo(8));
    expect(result.current.recipe.currentServings).toBe(8);
    expect(result.current.recipe.state.ingredientScale).toBe(2);
  });

  it("splitPortions only updates nutrition state", () => {
    const { result } = renderHook(() => useScalableRecipe(doc));
    act(() => result.current.splitPortions(2));
    expect(result.current.recipe.state.nutritionPortions).toBe(2);
    expect(result.current.recipe.state.ingredientScale).toBe(1);
  });

  it("anchorIngredientAmount updates ingredient scale", () => {
    const { result } = renderHook(() => useScalableRecipe(doc));
    act(() => result.current.anchorIngredientAmount(0, 4));
    expect(result.current.recipe.state.ingredientScale).toBe(2);
  });

  it("reset returns to defaults", () => {
    const { result } = renderHook(() => useScalableRecipe(doc));
    act(() => {
      result.current.scalePortionsTo(8);
      result.current.splitPortions(2);
    });
    expect(result.current.recipe.state.ingredientScale).toBe(2);
    expect(result.current.recipe.state.nutritionPortions).toBe(2);
    act(() => result.current.reset());
    expect(result.current.recipe.state.ingredientScale).toBe(1);
    expect(result.current.recipe.state.nutritionPortions).toBeNull();
  });

  it("rebuilds the instance at defaults when the document reference changes", () => {
    const { result, rerender } = renderHook(
      ({ d }: { d: RecipeDocument }) => useScalableRecipe(d),
      { initialProps: { d: doc } },
    );
    act(() => result.current.scalePortionsTo(8));
    expect(result.current.recipe.state.ingredientScale).toBe(2);

    const other: RecipeDocument = {
      ...doc,
      schema: { ...doc.schema, name: "Other", recipeYield: "6 servings" },
    };
    rerender({ d: other });
    expect(result.current.recipe.baseServings).toBe(6);
    expect(result.current.recipe.state.ingredientScale).toBe(1);
  });

  it("rebuilds when only the ingredients change", () => {
    const { result, rerender } = renderHook(
      ({ d }: { d: RecipeDocument }) => useScalableRecipe(d),
      { initialProps: { d: doc } },
    );
    rerender({ d: { ...doc, ingredients: makeIngredientLines(["1 egg"]) } });
    expect(result.current.recipe.ingredients.map((i) => i.original)).toEqual(["1 egg"]);
  });

  it("keeps the same instance when the document reference is unchanged", () => {
    const { result, rerender } = renderHook(
      ({ d }: { d: RecipeDocument }) => useScalableRecipe(d),
      { initialProps: { d: doc } },
    );
    const first = result.current.recipe;
    rerender({ d: doc });
    expect(result.current.recipe).toBe(first);
  });

  it("callbacks are stable across renders", () => {
    const { result, rerender } = renderHook(() => useScalableRecipe(doc));
    const firstScale = result.current.scalePortionsTo;
    const firstAnchor = result.current.anchorIngredientAmount;
    rerender();
    expect(result.current.scalePortionsTo).toBe(firstScale);
    expect(result.current.anchorIngredientAmount).toBe(firstAnchor);
  });
});
