import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import RecipeStateProvider from "@/components/RecipeStateProvider";
import * as windowApi from "@/lib/windowApi";
import type { SchemaRecipe } from "@/types/recipe";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const schema1: SchemaRecipe = { name: "Pasta Carbonara" };
const schema2: SchemaRecipe = { name: "Chicken Tikka" };

describe("RecipeStateProvider", () => {
  it("calls notifyRecipeUpdate with schemas on mount", () => {
    const spy = vi.spyOn(windowApi, "notifyRecipeUpdate");
    render(<RecipeStateProvider schemas={[schema1]} />);
    expect(spy).toHaveBeenCalledWith([schema1]);
  });

  it("calls notifyRecipeUpdate again when schemas prop changes", () => {
    const spy = vi.spyOn(windowApi, "notifyRecipeUpdate");
    const { rerender } = render(<RecipeStateProvider schemas={[schema1]} />);
    rerender(<RecipeStateProvider schemas={[schema2]} />);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith([schema2]);
  });

  it("does not call notifyRecipeUpdate again when schemas reference is stable", () => {
    const spy = vi.spyOn(windowApi, "notifyRecipeUpdate");
    const schemas = [schema1];
    const { rerender } = render(<RecipeStateProvider schemas={schemas} />);
    rerender(<RecipeStateProvider schemas={schemas} />);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("renders nothing", () => {
    const { container } = render(<RecipeStateProvider schemas={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
