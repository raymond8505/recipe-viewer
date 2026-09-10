import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RecipeGrid from "@/components/RecipeGrid";
import type { RecipeRow } from "@/types/recipe";
import { makeRecipe, makeNutritionRecipeRow, makeIngredientLines } from "@/fixtures";

/** A recipe with a category, so the default top badges have something to show. */
function categorized(id: string, name: string, overrides: Partial<RecipeRow> = {}) {
  return makeRecipe(id, name, {
    ...overrides,
    metadata: { schema: { name, recipeCategory: "Dinner" } },
  });
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

  it("gives each card calories and protein by default", () => {
    render(
      <RecipeGrid
        recipes={[
          makeNutritionRecipeRow("1", "Pasta", {
            calories_kcal: 1400,
            protein_g: 96,
          }),
        ]}
      />,
    );

    expect(screen.getByText("350 kcal")).toBeTruthy();
    expect(screen.getByText("24 g protein")).toBeTruthy();
  });

  // The default is calories and protein *where they resolve* — a recipe that
  // can't price its lines simply carries no nutrition badge, which is why the
  // grid needs no per-recipe opt-out.
  it("leaves a recipe with no resolvable nutrition without badges", () => {
    render(
      <RecipeGrid
        recipes={[
          makeRecipe("1", "Pasta", {
            ingredients: makeIngredientLines(["2 cups flour"]),
            metadata: { schema: { name: "Pasta", recipeYield: "4 servings" } },
          }),
        ]}
      />,
    );

    expect(screen.getByText("Pasta")).toBeTruthy();
    expect(screen.queryByText(/kcal/)).toBeNull();
  });

  it("uses the badges the caller supplies instead of the default", () => {
    render(
      <RecipeGrid
        recipes={[
          makeNutritionRecipeRow("1", "Pasta", {
            calories_kcal: 1400,
            protein_g: 96,
          }),
        ]}
        badges={(recipe) => [<span key="src">from {recipe.source}</span>]}
      />,
    );

    expect(screen.getByText(/from new.raymonds.recipes/)).toBeTruthy();
    expect(screen.queryByText("350 kcal")).toBeNull();
  });

  it("overlays each card's category by default", () => {
    render(<RecipeGrid recipes={[categorized("1", "Pasta")]} />);

    expect(screen.getByText("Dinner")).toBeTruthy();
  });

  // Whether a card shows its status is decided by what goes into the top-badge
  // array, not by anything the card asks.
  it("adds the status badge to the overlay only when asked", () => {
    const recipes = [categorized("1", "Pasta", { status: "draft" })];

    const { unmount } = render(<RecipeGrid recipes={recipes} />);
    expect(screen.queryByText("draft")).toBeNull();
    unmount();

    render(<RecipeGrid recipes={recipes} showStatusBadge />);
    expect(screen.getByText("draft")).toBeTruthy();
  });

  it("lets a caller's top badges take over the status flag as well", () => {
    render(
      <RecipeGrid
        recipes={[categorized("1", "Pasta", { status: "draft" })]}
        showStatusBadge
        topBadges={() => [<span key="mine">mine only</span>]}
      />,
    );

    expect(screen.getByText("mine only")).toBeTruthy();
    expect(screen.queryByText("draft")).toBeNull();
    expect(screen.queryByText("Dinner")).toBeNull();
  });
});
