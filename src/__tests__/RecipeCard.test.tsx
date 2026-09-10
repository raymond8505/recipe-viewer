import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RecipeCard from "@/components/RecipeCard";
import { RecipeNutritionBadge } from "@/components/RecipeNutritionBadge";
import { makeRecipe } from "@/fixtures";

const mockRecipe = makeRecipe("test-id-123", "Chocolate Cake", {
  url: "https://example.com/recipe",
  source: "example.com",
  total_time: 3600,
  metadata: {
    schema: {
      name: "Chocolate Cake",
      description: "A rich, moist chocolate cake perfect for any occasion.",
      totalTime: "PT1H",
      recipeCategory: ["Dessert"],
      recipeInstructions: [{ text: "Mix ingredients." }, { text: "Bake at 350°F." }],
    },
  },
});

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
    const recipeWithImage = makeRecipe("test-id-123", "Chocolate Cake", {
      metadata: {
        schema: { ...mockRecipe.metadata.schema, image: "https://example.com/cake.jpg" },
      },
    });
    render(<RecipeCard recipe={recipeWithImage} />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("cake.jpg");
  });

  // The card places badges; it does not choose or build them. Anything the
  // caller hands it lands in the footer, after the category.
  it("renders the badges it is given", () => {
    render(
      <RecipeCard
        recipe={mockRecipe}
        badges={[
          <RecipeNutritionBadge
            key="calories"
            field="calories"
            value={{ value: 350, unit: "kcal" }}
          />,
          <span key="custom">anything at all</span>,
        ]}
      />,
    );

    expect(screen.getByText("350 kcal")).toBeTruthy();
    expect(screen.getByText("anything at all")).toBeTruthy();
  });

  it("renders the footer without badges when given none", () => {
    render(<RecipeCard recipe={mockRecipe} badges={[]} />);

    expect(screen.getByText("1 hr")).toBeTruthy();
    expect(screen.getByText("Dessert")).toBeTruthy();
  });
});
