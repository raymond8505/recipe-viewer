import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import NutritionPanel, { scaleNutrientValue } from "@/components/NutritionPanel";
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

describe("scaleNutrientValue", () => {
  it("scales a value with a spaced unit", () => {
    expect(scaleNutrientValue("350 kcal", 2)).toBe("700 kcal");
  });

  it("scales a value with an attached unit", () => {
    expect(scaleNutrientValue("20g", 2)).toBe("40g");
  });

  it("rounds to one decimal place", () => {
    expect(scaleNutrientValue("25g", 1.5)).toBe("37.5g");
  });

  it("strips trailing zero decimal", () => {
    expect(scaleNutrientValue("10g", 2)).toBe("20g");
  });

  it("returns raw value unchanged for unrecognized format", () => {
    expect(scaleNutrientValue("unknown", 2)).toBe("unknown");
  });

  it("handles fractional multiplier", () => {
    expect(scaleNutrientValue("300 kcal", 0.5)).toBe("150 kcal");
  });
});

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
    expect(screen.getByText("20g")).toBeTruthy();
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
