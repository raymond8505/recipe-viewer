import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RecipeCard from "@/components/RecipeCard";
import type { RecipeRow } from "@/types/recipe";

const mockRecipe: RecipeRow = {
  id: "test-id-123",
  url: "https://example.com/recipe",
  source: "example.com",
  schema: {
    name: "Chocolate Cake",
    description: "A rich, moist chocolate cake perfect for any occasion.",
    totalTime: "PT1H",
    recipeCategory: ["Dessert"],
    recipeIngredient: ["2 cups flour", "1 cup sugar"],
    recipeInstructions: [{ text: "Mix ingredients." }, { text: "Bake at 350°F." }],
  },
};

describe("RecipeCard", () => {
  it("renders the recipe name", () => {
    render(<RecipeCard recipe={mockRecipe} />);
    expect(screen.getByText("Chocolate Cake")).toBeTruthy();
  });

  it("renders the description", () => {
    render(<RecipeCard recipe={mockRecipe} />);
    expect(
      screen.getByText(/rich, moist chocolate cake/i)
    ).toBeTruthy();
  });

  it("renders the total time", () => {
    render(<RecipeCard recipe={mockRecipe} />);
    expect(screen.getByText("1 hr")).toBeTruthy();
  });

  it("renders the category tag", () => {
    render(<RecipeCard recipe={mockRecipe} />);
    expect(screen.getByText("Dessert")).toBeTruthy();
  });

  it("links to the recipe detail page", () => {
    render(<RecipeCard recipe={mockRecipe} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/recipes/test-id-123");
  });

  it("renders placeholder when no image", () => {
    render(<RecipeCard recipe={mockRecipe} />);
    // No img element when there's no image
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders image when provided", () => {
    const recipeWithImage: RecipeRow = {
      ...mockRecipe,
      schema: { ...mockRecipe.schema, image: "https://example.com/cake.jpg" },
    };
    render(<RecipeCard recipe={recipeWithImage} />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("cake.jpg");
  });
});
