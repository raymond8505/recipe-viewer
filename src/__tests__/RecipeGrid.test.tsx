import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RecipeGrid from "@/components/RecipeGrid";
import type { RecipeRow } from "@/types/recipe";

function makeRecipe(id: string, name: string): RecipeRow {
  return {
    id,
    url: `https://example.com/${id}`,
    source: "example.com",
    metadata: { schema: { name } },
  };
}

describe("RecipeGrid", () => {
  it("shows 'No recipes found.' when given an empty array", () => {
    render(<RecipeGrid recipes={[]} />);
    expect(screen.getByText("No recipes found.")).toBeTruthy();
  });

  it("renders a card for each recipe", () => {
    const recipes = [
      makeRecipe("1", "Pasta"),
      makeRecipe("2", "Pizza"),
      makeRecipe("3", "Salad"),
    ];
    render(<RecipeGrid recipes={recipes} />);
    expect(screen.getByText("Pasta")).toBeTruthy();
    expect(screen.getByText("Pizza")).toBeTruthy();
    expect(screen.getByText("Salad")).toBeTruthy();
  });

  it("links each card to the correct recipe detail page", () => {
    const recipes = [makeRecipe("42", "Tacos")];
    render(<RecipeGrid recipes={recipes} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/recipes/42");
  });

  it("does not render the empty state when recipes are present", () => {
    render(<RecipeGrid recipes={[makeRecipe("1", "Pasta")]} />);
    expect(screen.queryByText("No recipes found.")).toBeNull();
  });
});
