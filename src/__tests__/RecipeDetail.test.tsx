import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RecipeDetail from "@/components/RecipeDetail";
import type { RecipeRow, HowToStep, HowToSection, SchemaRecipe } from "@/types/recipe";

function makeRecipe(schema: Partial<SchemaRecipe> = {}): RecipeRow {
  return {
    id: "1",
    url: "https://example.com",
    source: "example.com",
    metadata: {
      schema: {
        name: "Test Recipe",
        ...schema,
      },
    },
  };
}

describe("RecipeDetail", () => {
  it("renders the recipe name", () => {
    render(<RecipeDetail recipe={makeRecipe({ name: "Spaghetti Bolognese" })} />);
    expect(screen.getByText("Spaghetti Bolognese")).toBeTruthy();
  });

  it("renders description when present", () => {
    render(<RecipeDetail recipe={makeRecipe({ description: "A hearty pasta dish." })} />);
    expect(screen.getByText("A hearty pasta dish.")).toBeTruthy();
  });

  it("renders the author name", () => {
    render(<RecipeDetail recipe={makeRecipe({ author: { name: "Julia Child" } })} />);
    expect(screen.getByText("By Julia Child")).toBeTruthy();
  });

  it("renders category badges", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeCategory: ["Dinner", "Pasta"] })} />);
    expect(screen.getByText("Dinner")).toBeTruthy();
    expect(screen.getByText("Pasta")).toBeTruthy();
  });

  it("renders cuisine badge", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeCuisine: "Italian" })} />);
    expect(screen.getByText("Italian")).toBeTruthy();
  });

  it("renders an image when present", () => {
    render(<RecipeDetail recipe={makeRecipe({ image: "https://example.com/pasta.jpg" })} />);
    expect(screen.getByRole("img")).toBeTruthy();
  });

  it("hides image when absent", () => {
    render(<RecipeDetail recipe={makeRecipe()} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders timing stats when present", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ prepTime: "PT10M", cookTime: "PT30M", totalTime: "PT40M" })}
      />
    );
    expect(screen.getByText("10 min")).toBeTruthy();
    expect(screen.getByText("30 min")).toBeTruthy();
    expect(screen.getByText("40 min")).toBeTruthy();
  });

  it("renders recipeYield from array (first element)", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeYield: ["4 servings", "8 pieces"] })} />);
    expect(screen.getByText("4 servings")).toBeTruthy();
  });

  it("renders recipeYield from string directly", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeYield: "6 servings" })} />);
    expect(screen.getByText("6 servings")).toBeTruthy();
  });

  it("renders flat HowToStep instructions as a numbered list", () => {
    const steps: HowToStep[] = [
      { "@type": "HowToStep", text: "Boil water." },
      { "@type": "HowToStep", text: "Add pasta." },
    ];
    render(<RecipeDetail recipe={makeRecipe({ recipeInstructions: steps })} />);
    expect(screen.getByText("Boil water.")).toBeTruthy();
    expect(screen.getByText("Add pasta.")).toBeTruthy();
  });

  it("renders HowToSection instructions with section headers", () => {
    const sections: HowToSection[] = [
      {
        "@type": "HowToSection",
        name: "For the sauce",
        itemListElement: [{ text: "Simmer tomatoes." }],
      },
      {
        "@type": "HowToSection",
        name: "For the pasta",
        itemListElement: [{ text: "Boil salted water." }],
      },
    ];
    render(<RecipeDetail recipe={makeRecipe({ recipeInstructions: sections })} />);
    expect(screen.getByText("For the sauce")).toBeTruthy();
    expect(screen.getByText("Simmer tomatoes.")).toBeTruthy();
    expect(screen.getByText("For the pasta")).toBeTruthy();
    expect(screen.getByText("Boil salted water.")).toBeTruthy();
  });

  it("shows nutrition section when at least one nutrient field is present", () => {
    render(
      <RecipeDetail recipe={makeRecipe({ nutrition: { calories: "350 kcal" } })} />
    );
    expect(screen.getByText("Nutrition")).toBeTruthy();
    expect(screen.getByText("350 kcal")).toBeTruthy();
  });

  it("shows all present nutrition fields", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({
          nutrition: {
            calories: "350 kcal",
            proteinContent: "20g",
            carbohydrateContent: "40g",
            fatContent: "10g",
          },
        })}
      />
    );
    expect(screen.getByText("350 kcal")).toBeTruthy();
    expect(screen.getByText("20g")).toBeTruthy();
    expect(screen.getByText("40g")).toBeTruthy();
    expect(screen.getByText("10g")).toBeTruthy();
  });

  it("hides nutrition section when only non-counted fields are present (e.g. servingSize)", () => {
    render(
      <RecipeDetail recipe={makeRecipe({ nutrition: { servingSize: "1 cup" } })} />
    );
    expect(screen.queryByText("Nutrition")).toBeNull();
  });

  it("hides nutrition section when nutrition is absent", () => {
    render(<RecipeDetail recipe={makeRecipe()} />);
    expect(screen.queryByText("Nutrition")).toBeNull();
  });

  it("renders ingredients list", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ recipeIngredient: ["2 cups flour", "1 cup sugar"] })}
      />
    );
    expect(screen.getByText("2 cups flour")).toBeTruthy();
    expect(screen.getByText("1 cup sugar")).toBeTruthy();
  });
});
