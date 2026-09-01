import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import NutritionPanel from "@/components/NutritionPanel";
import { ScalableRecipe } from "@/lib/ScalableRecipe";
import { makeScalableRecipe, quantitativeValueYield } from "@/fixtures";

/** Stateful wrapper so the stepper can actually update via onSplitPortions. */
function Harness({
  initial,
  showSources,
}: {
  initial: ScalableRecipe;
  showSources?: boolean;
}) {
  const [recipe, setRecipe] = useState(initial);
  return (
    <NutritionPanel
      recipe={recipe}
      onSplitPortions={(n) => setRecipe((r) => r.splitPortions(n))}
      showSources={showSources}
    />
  );
}

describe("NutritionPanel", () => {
  it("renders nutrition section with fields", () => {
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: { calories: "350 kcal", proteinContent: "20g" },
    });
    render(<Harness initial={r} />);
    expect(screen.getByText("Nutrition")).toBeTruthy();
    expect(screen.getByText("350 kcal")).toBeTruthy();
    // "20g" in the schema normalizes to spaced display — units are re-attached
    // from the parsed NutrientValue, never echoed from the raw string.
    expect(screen.getByText("20 g")).toBeTruthy();
  });

  it("returns null when no countable nutrition data is present", () => {
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: { servingSize: "1 cup" },
    });
    const { container } = render(<Harness initial={r} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows one 'ingredients' header badge when the ingredients view is served", () => {
    // Fully covered → the whole panel serves the ingredients view: one badge,
    // and the recipe-only fat field does NOT fill the gap (all-or-nothing).
    const r = new ScalableRecipe(
      makeScalableRecipe({
        recipeIngredient: undefined,
        recipeYield: "4 servings",
        nutrition: { fatContent: "5 g" },
      }).schema,
      undefined,
      { total: { calories_kcal: 2000, protein_g: 40 }, fullyCovered: true },
    );
    render(<Harness initial={r} showSources />);
    expect(screen.getByText("500 kcal")).toBeTruthy();
    expect(screen.getAllByText("ingredients")).toHaveLength(1);
    expect(screen.queryByText("recipe")).toBeNull();
    expect(screen.queryByText("5 g")).toBeNull();
  });

  it("hides the source badge when showSources is false, even if normalized", () => {
    const r = new ScalableRecipe(
      makeScalableRecipe({
        recipeIngredient: undefined,
        recipeYield: "4 servings",
        nutrition: { fatContent: "5 g" },
      }).schema,
      undefined,
      { total: { calories_kcal: 2000, protein_g: 40 }, fullyCovered: true },
    );
    render(<Harness initial={r} />);
    expect(screen.queryByText("ingredients")).toBeNull();
    expect(screen.queryByText("recipe")).toBeNull();
  });

  it("shows one 'recipe' header badge for a non-normalized recipe", () => {
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: { calories: "350 kcal" },
    });
    render(<Harness initial={r} showSources />);
    expect(screen.getAllByText("recipe")).toHaveLength(1);
    expect(screen.queryByText("ingredients")).toBeNull();
  });

  it("shows 'per serving' at the default portion count", () => {
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: { calories: "350 kcal" },
    });
    render(<Harness initial={r} />);
    expect(screen.getByText("per serving")).toBeTruthy();
    expect(screen.getByText("1/4")).toBeTruthy();
  });

  it("rounds displayed values over 1 to the nearest integer, keeping sub-1 precision", () => {
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: { proteinContent: "9.96 g", fiberContent: "0.2 g" },
    });
    render(<Harness initial={r} />);
    expect(screen.getByText("10 g")).toBeTruthy();
    expect(screen.getByText("0.2 g")).toBeTruthy();
  });

  it("shows unscaled values at the default portion count", () => {
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: { calories: "350 kcal" },
    });
    render(<Harness initial={r} />);
    expect(screen.getByText("350 kcal")).toBeTruthy();
  });

  it("scales values and flips to 'per portion' when portions differ from servings", () => {
    // 4 servings, 350 kcal per serving; split into 2 portions → each portion is 2 servings → 700 kcal.
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: { calories: "350 kcal" },
    });
    render(<Harness initial={r} />);
    fireEvent.click(screen.getByRole("button", { name: /larger portion size/i }));
    fireEvent.click(screen.getByRole("button", { name: /larger portion size/i }));
    expect(screen.getByText("per portion")).toBeTruthy();
    expect(screen.getByText("700 kcal")).toBeTruthy();
  });

  it("increases portions and scales down per-portion values", () => {
    // 4 servings, 400 kcal each; split into 8 portions → each is half a serving → 200 kcal.
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: { calories: "400 kcal" },
    });
    render(<Harness initial={r} />);
    const more = screen.getByRole("button", { name: /smaller portion size/i });
    fireEvent.click(more);
    fireEvent.click(more);
    fireEvent.click(more);
    fireEvent.click(more);
    expect(screen.getByText("per portion")).toBeTruthy();
    expect(screen.getByText("200 kcal")).toBeTruthy();
  });

  it("disables decrease button at minimum of 1 portion", () => {
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: { calories: "300 kcal" },
    });
    render(<Harness initial={r} />);
    const decreaseBtn = screen.getByRole("button", { name: /larger portion size/i });
    fireEvent.click(decreaseBtn);
    fireEvent.click(decreaseBtn);
    fireEvent.click(decreaseBtn);
    expect(decreaseBtn).toBeDisabled();
  });

  it("hides stepper when recipe has no parsed yield", () => {
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: undefined,
      nutrition: { calories: "350 kcal" },
    });
    render(<Harness initial={r} />);
    expect(screen.queryByRole("button", { name: /larger portion size/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /smaller portion size/i })).toBeNull();
    expect(screen.getByText("per serving")).toBeTruthy();
  });

  it("shows the per-serving weight when the yield carries a valueReference", () => {
    // 4 kebabs from 454 g → 454/4 = 113.5 → "per 114 g serving".
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: quantitativeValueYield,
      nutrition: { calories: "350 kcal" },
    });
    render(<Harness initial={r} />);
    expect(screen.getByText("per 114 g serving")).toBeTruthy();
  });
});

describe("NutritionPanel — summary/label view toggle", () => {
  // NOTE for anyone adding cases here: in label view `nutritionUnitLabel`
  // renders TWICE (the header span and the label's own serving line), so
  // assertions on "per serving" / "per 114 g serving" in that view must use
  // getAllByText. The tests above get away with getByText only because the
  // default view is "summary" — don't flip the default.

  const fullNutrition = {
    calories: "520 kcal",
    fatContent: "18 g",
    saturatedFatContent: "5 g",
    unsaturatedFatContent: "8 g",
    cholesterolContent: "50 mg",
    sodiumContent: "820 mg",
    carbohydrateContent: "48 g",
    fiberContent: "6 g",
    sugarContent: "10 g",
    proteinContent: "32 g",
  };

  const makeFull = () =>
    makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: fullNutrition,
    });

  it("lands on the summary grid, not the label", () => {
    render(<Harness initial={makeFull()} />);
    expect(screen.getByText("Carbs")).toBeTruthy();
    expect(screen.queryByText("Nutrition Facts")).toBeNull();
  });

  it("swaps the grid for the full label, showing the four nutrients the grid drops", () => {
    render(<Harness initial={makeFull()} />);
    fireEvent.click(screen.getByRole("button", { name: "Full label" }));

    expect(screen.getByText("Nutrition Facts")).toBeTruthy();
    // The grid's curated six omit these entirely; the label is the only way to
    // see them.
    expect(screen.getByText("Total Sugars")).toBeTruthy();
    expect(screen.getByText("Saturated Fat")).toBeTruthy();
    expect(screen.getByText("Unsaturated Fat")).toBeTruthy();
    expect(screen.getByText("Cholesterol")).toBeTruthy();
    // ...and the grid itself is gone.
    expect(screen.queryByText("Carbs")).toBeNull();
  });

  it("exposes the active view through aria-pressed and toggles back", () => {
    render(<Harness initial={makeFull()} />);
    const summary = screen.getByRole("button", { name: "Summary" });
    const label = screen.getByRole("button", { name: "Full label" });
    expect(summary).toHaveAttribute("aria-pressed", "true");
    expect(label).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(label);
    expect(summary).toHaveAttribute("aria-pressed", "false");
    expect(label).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(summary);
    expect(screen.getByText("Carbs")).toBeTruthy();
    expect(screen.queryByText("Nutrition Facts")).toBeNull();
  });

  it("keeps the label on the same basis as the grid when portions change", () => {
    // 4 servings at 520 kcal each; split into 8 portions → half a serving each
    // → 260 kcal. The label is a layout swap, not another nutrition source.
    render(<Harness initial={makeFull()} />);
    fireEvent.click(screen.getByRole("button", { name: "Full label" }));
    const smaller = screen.getByRole("button", { name: /smaller portion size/i });
    fireEvent.click(smaller);
    fireEvent.click(smaller);
    fireEvent.click(smaller);
    fireEvent.click(smaller);

    expect(screen.getByText("260 kcal")).toBeTruthy();
    expect(screen.getAllByText("per portion")).toHaveLength(2);
    // Still in label view — a portion change must not reset the toggle.
    expect(screen.getByText("Nutrition Facts")).toBeTruthy();
  });

  it("stays available on a sparse recipe, where the em dashes are the signal", () => {
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: { calories: "350 kcal" },
    });
    render(<Harness initial={r} />);
    fireEvent.click(screen.getByRole("button", { name: "Full label" }));
    expect(screen.getByText("350 kcal")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(9);
  });

  it("offers no toggle in the no-nutrition shell", () => {
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: undefined,
    });
    render(
      <NutritionPanel
        recipe={r}
        onSplitPortions={() => {}}
        ingredientsHref="/recipes/r-1/ingredients"
      />,
    );
    expect(screen.queryByRole("button", { name: "Full label" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Nutrition view" })).toBeNull();
  });
});

describe("NutritionPanel — ingredient breakdown link", () => {
  it("renders the link with the given href alongside nutrition data", () => {
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: { calories: "350 kcal" },
    });
    render(
      <NutritionPanel
        recipe={r}
        onSplitPortions={() => {}}
        ingredientsHref="/recipes/r-1/ingredients"
      />,
    );
    const link = screen.getByRole("link", { name: "Ingredient breakdown" });
    expect(link).toHaveAttribute("href", "/recipes/r-1/ingredients");
    expect(screen.getByText("350 kcal")).toBeTruthy();
  });

  it("renders a shell with the link when the recipe has no nutrition", () => {
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: undefined,
    });
    render(
      <NutritionPanel
        recipe={r}
        onSplitPortions={() => {}}
        ingredientsHref="/recipes/r-1/ingredients"
      />,
    );
    expect(screen.getByText("Nutrition")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ingredient breakdown" })).toBeTruthy();
    expect(screen.getByText("No nutrition data on this recipe yet.")).toBeTruthy();
  });

  it("still renders nothing without nutrition or an href (anonymous view)", () => {
    const r = makeScalableRecipe({
      recipeIngredient: undefined,
      recipeYield: "4 servings",
      nutrition: undefined,
    });
    const { container } = render(
      <NutritionPanel recipe={r} onSplitPortions={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
