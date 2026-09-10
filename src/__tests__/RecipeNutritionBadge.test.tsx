import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RecipeNutritionBadge,
  recipeNutritionBadges,
} from "@/components/RecipeNutritionBadge";
import {
  makeNutritionRecipeRow,
  makeRecipe,
  makeIngredientLines,
  makeMatchedIngredient,
  makeIngredient,
  recipeFixtures,
} from "@/fixtures";

// 1400 kcal / 96 g protein over the factory's four servings.
const perServing = { calories_kcal: 1400, protein_g: 96 };

function renderBadges(badges: React.ReactElement[]) {
  render(<>{badges}</>);
}

describe("RecipeNutritionBadge", () => {
  it("names the nutrient after its amount", () => {
    render(
      <RecipeNutritionBadge
        field="proteinContent"
        value={{ value: 24, unit: "g" }}
      />,
    );
    expect(screen.getByText("24 g protein")).toBeTruthy();
  });

  it("leaves calories unnamed, because kcal already names it", () => {
    render(
      <RecipeNutritionBadge field="calories" value={{ value: 350, unit: "kcal" }} />,
    );
    expect(screen.getByText("350 kcal")).toBeTruthy();
  });

  it("states the per-serving basis the card has no room to spell out", () => {
    render(
      <RecipeNutritionBadge field="calories" value={{ value: 350, unit: "kcal" }} />,
    );
    expect(screen.getByTitle("Per serving")).toBeTruthy();
  });

  it("rounds a display value the way every other nutrition surface does", () => {
    render(
      <RecipeNutritionBadge
        field="proteinContent"
        value={{ value: 23.6, unit: "g" }}
      />,
    );
    expect(screen.getByText("24 g protein")).toBeTruthy();
  });
});

describe("recipeNutritionBadges", () => {
  it("defaults to calories and protein, in that order", () => {
    const badges = recipeNutritionBadges(
      makeNutritionRecipeRow("r-1", "Curry", perServing),
    );

    expect(badges).toHaveLength(2);
    renderBadges(badges);
    expect(screen.getByText("350 kcal")).toBeTruthy();
    expect(screen.getByText("24 g protein")).toBeTruthy();
  });

  it("picks the fields it is given, in the order given", () => {
    const badges = recipeNutritionBadges(
      makeNutritionRecipeRow("r-1", "Curry", {
        ...perServing,
        carbs_g: 200,
      }),
      ["carbohydrateContent", "calories"],
    );

    renderBadges(badges);
    expect(screen.getByText("50 g carbs")).toBeTruthy();
    expect(screen.getByText("350 kcal")).toBeTruthy();
    expect(screen.queryByText(/protein/)).toBeNull();
  });

  it("skips a requested field the recipe carries no value for", () => {
    const badges = recipeNutritionBadges(
      makeNutritionRecipeRow("r-1", "Curry", { calories_kcal: 1400 }),
    );

    expect(badges).toHaveLength(1);
    renderBadges(badges);
    expect(screen.getByText("350 kcal")).toBeTruthy();
  });

  // The four ways a recipe reaches "no nutrition". All four render nothing
  // rather than a total that undercounts what it couldn't price.
  it("shows nothing when a line is unmatched", () => {
    const matched = makeMatchedIngredient(
      "1 portion curry",
      makeIngredient("cat-curry", "curry", { nutrition: perServing }),
      { estimated_grams: 100 },
    );
    const recipe = makeNutritionRecipeRow("r-1", "Curry", perServing, {
      ingredients: makeIngredientLines([matched, "salt to taste"]),
    });

    expect(recipeNutritionBadges(recipe)).toEqual([]);
  });

  it("shows nothing when the recipe has no yield to divide by", () => {
    const recipe = makeNutritionRecipeRow("r-1", "Curry", perServing, {
      servings: null,
    });

    expect(recipeNutritionBadges(recipe)).toEqual([]);
  });

  it("shows nothing when the recipe has no ingredients at all", () => {
    expect(recipeNutritionBadges(makeRecipe("r-1", "Curry"))).toEqual([]);
  });

  // What a row read without `getRecipes({ catalog: true })` looks like: the
  // lines are there, their catalog rows are not.
  it("shows nothing for a row whose lines carry no catalog data", () => {
    const recipe = makeRecipe("r-1", "Curry", {
      ingredients: makeIngredientLines(["2 tsp cumin seed"]),
      metadata: { schema: { name: "Curry", recipeYield: "4 servings" } },
    });

    expect(recipeNutritionBadges(recipe)).toEqual([]);
  });

  it("shows nothing for the stored schema.nutrition alone", () => {
    // recipeFixtures[0] carries a schema.nutrition block and no matched lines.
    // Stored, never read back as nutrition.
    expect(recipeNutritionBadges(recipeFixtures[0])).toEqual([]);
  });
});
