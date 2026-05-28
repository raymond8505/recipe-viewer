import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScalableRecipe } from "@/hooks/useScalableRecipe";
import type { SchemaRecipe } from "@/types/recipe";

const schema: SchemaRecipe = {
  name: "Test",
  recipeYield: "4 servings",
  recipeIngredient: ["2 cups flour", "3-5 cloves garlic"],
  nutrition: { calories: "200 kcal" },
};

describe("useScalableRecipe", () => {
  it("starts with a default-state recipe matching the schema", () => {
    const { result } = renderHook(() => useScalableRecipe(schema));
    expect(result.current.recipe.baseServings).toBe(4);
    expect(result.current.recipe.currentServings).toBe(4);
    expect(result.current.recipe.state.ingredientScale).toBe(1);
    expect(result.current.recipe.state.nutritionPortions).toBeNull();
  });

  it("scalePortionsTo updates currentServings", () => {
    const { result } = renderHook(() => useScalableRecipe(schema));
    act(() => result.current.scalePortionsTo(8));
    expect(result.current.recipe.currentServings).toBe(8);
    expect(result.current.recipe.state.ingredientScale).toBe(2);
  });

  it("splitPortions only updates nutrition state", () => {
    const { result } = renderHook(() => useScalableRecipe(schema));
    act(() => result.current.splitPortions(2));
    expect(result.current.recipe.state.nutritionPortions).toBe(2);
    expect(result.current.recipe.state.ingredientScale).toBe(1);
  });

  it("anchorIngredientAmount updates ingredient scale", () => {
    const { result } = renderHook(() => useScalableRecipe(schema));
    act(() => result.current.anchorIngredientAmount(0, 4));
    expect(result.current.recipe.state.ingredientScale).toBe(2);
  });

  it("reset returns to defaults", () => {
    const { result } = renderHook(() => useScalableRecipe(schema));
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

  it("rebuilds the instance at defaults when schema reference changes", () => {
    const { result, rerender } = renderHook(
      ({ s }: { s: SchemaRecipe }) => useScalableRecipe(s),
      { initialProps: { s: schema } },
    );
    act(() => result.current.scalePortionsTo(8));
    expect(result.current.recipe.state.ingredientScale).toBe(2);

    const otherSchema: SchemaRecipe = { ...schema, name: "Other", recipeYield: "6 servings" };
    rerender({ s: otherSchema });
    expect(result.current.recipe.baseServings).toBe(6);
    expect(result.current.recipe.state.ingredientScale).toBe(1);
  });

  it("keeps the same instance when schema reference is unchanged", () => {
    const { result, rerender } = renderHook(
      ({ s }: { s: SchemaRecipe }) => useScalableRecipe(s),
      { initialProps: { s: schema } },
    );
    const first = result.current.recipe;
    rerender({ s: schema });
    expect(result.current.recipe).toBe(first);
  });

  it("callbacks are stable across renders", () => {
    const { result, rerender } = renderHook(() => useScalableRecipe(schema));
    const firstScale = result.current.scalePortionsTo;
    const firstAnchor = result.current.anchorIngredientAmount;
    rerender();
    expect(result.current.scalePortionsTo).toBe(firstScale);
    expect(result.current.anchorIngredientAmount).toBe(firstAnchor);
  });
});
