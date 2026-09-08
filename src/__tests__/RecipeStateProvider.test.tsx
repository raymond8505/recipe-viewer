import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import RecipeStateProvider from "@/components/RecipeStateProvider";
import * as windowApi from "@/lib/windowApi";
import type { SchemaOrgRecipe } from "@/types/recipe";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const recipe1: SchemaOrgRecipe = { name: "Pasta Carbonara", recipeIngredient: ["1 egg"] };
const recipe2: SchemaOrgRecipe = { name: "Chicken Tikka" };

describe("RecipeStateProvider", () => {
  it("calls notifyRecipeUpdate with the recipes on mount", () => {
    const spy = vi.spyOn(windowApi, "notifyRecipeUpdate");
    render(<RecipeStateProvider recipes={[recipe1]} />);
    expect(spy).toHaveBeenCalledWith([recipe1]);
  });

  it("calls notifyRecipeUpdate again when the recipes prop changes", () => {
    const spy = vi.spyOn(windowApi, "notifyRecipeUpdate");
    const { rerender } = render(<RecipeStateProvider recipes={[recipe1]} />);
    rerender(<RecipeStateProvider recipes={[recipe2]} />);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith([recipe2]);
  });

  it("does not call notifyRecipeUpdate again when the recipes reference is stable", () => {
    const spy = vi.spyOn(windowApi, "notifyRecipeUpdate");
    const recipes = [recipe1];
    const { rerender } = render(<RecipeStateProvider recipes={recipes} />);
    rerender(<RecipeStateProvider recipes={recipes} />);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("renders nothing", () => {
    const { container } = render(<RecipeStateProvider recipes={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
