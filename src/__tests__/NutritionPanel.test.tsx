import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import NutritionPanel from "@/components/NutritionPanel";
import { ScalableRecipe } from "@/lib/ScalableRecipe";
import { makeNutritionRecipe, quantitativeValueYield } from "@/fixtures";

/** Stateful wrapper so the stepper can actually update via onSplitPortions. */
function Harness({ initial }: { initial: ScalableRecipe }) {
  const [recipe, setRecipe] = useState(initial);
  return (
    <NutritionPanel
      recipe={recipe}
      onSplitPortions={(n) => setRecipe((r) => r.splitPortions(n))}
    />
  );
}

// Every recipe here comes from makeNutritionRecipe: four servings, a
// fully-covered catalog total, no schema.nutrition in play. Totals are
// WHOLE-RECIPE, so the per-serving figure each test asserts is the total ÷ 4 —
// 1400 kcal reads as "350 kcal". Only the cases that need something else (a
// structured yield, no yield, an uncovered list) pass overrides.
describe("NutritionPanel", () => {
  it("renders nutrition section with fields", () => {
    const r = makeNutritionRecipe({ calories_kcal: 1400, protein_g: 80 });
    render(<Harness initial={r} />);
    expect(screen.getByText("Nutrition")).toBeTruthy();
    expect(screen.getByText("350 kcal")).toBeTruthy();
    // Units are re-attached from the parsed NutrientValue, never echoed from a
    // raw string — so protein renders spaced.
    expect(screen.getByText("20 g")).toBeTruthy();
  });

  it("returns null when the ingredient list isn't fully covered", () => {
    const r = makeNutritionRecipe(
      { calories_kcal: 1400 },
      { fullyCovered: false },
    );
    const { container } = render(<Harness initial={r} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when the catalog total carries no countable nutrient", () => {
    const r = makeNutritionRecipe({});
    const { container } = render(<Harness initial={r} />);
    expect(container.firstChild).toBeNull();
  });

  it("ignores the recipe's own stored nutrition fields entirely", () => {
    // The stored blob says 999 kcal; the catalog says 1400/4 = 350. The catalog
    // is the only source, so the stored figure must not appear anywhere.
    const r = makeNutritionRecipe(
      { calories_kcal: 1400 },
      { schema: { nutrition: { calories: "999 kcal", fatContent: "5 g" } } },
    );
    render(<Harness initial={r} />);
    expect(screen.getByText("350 kcal")).toBeTruthy();
    expect(screen.queryByText("999 kcal")).toBeNull();
    // ...and a nutrient only the stored blob has does not fill the gap.
    expect(screen.queryByText("5 g")).toBeNull();
  });

  it("shows 'per serving' at the default portion count", () => {
    const r = makeNutritionRecipe({ calories_kcal: 1400 });
    render(<Harness initial={r} />);
    expect(screen.getByText("per serving")).toBeTruthy();
    expect(screen.getByText("1/4")).toBeTruthy();
  });

  it("rounds displayed values over 1 to the nearest integer, keeping sub-1 precision", () => {
    const r = makeNutritionRecipe({ protein_g: 39.84, fiber_g: 0.8 });
    render(<Harness initial={r} />);
    expect(screen.getByText("10 g")).toBeTruthy();
    expect(screen.getByText("0.2 g")).toBeTruthy();
  });

  it("scales values and flips to 'per portion' when portions differ from servings", () => {
    // 4 servings, 350 kcal each; split into 2 portions → each portion is 2 servings → 700 kcal.
    const r = makeNutritionRecipe({ calories_kcal: 1400 });
    render(<Harness initial={r} />);
    fireEvent.click(screen.getByRole("button", { name: /larger portion size/i }));
    fireEvent.click(screen.getByRole("button", { name: /larger portion size/i }));
    expect(screen.getByText("per portion")).toBeTruthy();
    expect(screen.getByText("700 kcal")).toBeTruthy();
  });

  it("increases portions and scales down per-portion values", () => {
    // 4 servings, 400 kcal each; split into 8 portions → each is half a serving → 200 kcal.
    const r = makeNutritionRecipe({ calories_kcal: 1600 });
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
    const r = makeNutritionRecipe({ calories_kcal: 1200 });
    render(<Harness initial={r} />);
    const decreaseBtn = screen.getByRole("button", { name: /larger portion size/i });
    fireEvent.click(decreaseBtn);
    fireEvent.click(decreaseBtn);
    fireEvent.click(decreaseBtn);
    expect(decreaseBtn).toBeDisabled();
  });

  it("hides stepper when recipe has no parsed yield", () => {
    // No yield means no servings to divide by, so nothing resolves — the panel
    // needs the breakdown link to render its shell at all.
    const r = makeNutritionRecipe(
      { calories_kcal: 1400 },
      { schema: { recipeYield: undefined } },
    );
    render(
      <NutritionPanel
        recipe={r}
        onSplitPortions={() => {}}
        ingredientsHref="/recipes/r-1/ingredients"
      />,
    );
    expect(screen.queryByRole("button", { name: /larger portion size/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /smaller portion size/i })).toBeNull();
    expect(screen.getByText("No nutrition data on this recipe yet.")).toBeTruthy();
  });

  it("shows the per-serving weight when the yield carries a valueReference", () => {
    // 4 kebabs from 454 g → 454/4 = 113.5 → "per 114 g serving".
    const r = makeNutritionRecipe(
      { calories_kcal: 1400 },
      { schema: { recipeYield: quantitativeValueYield } },
    );
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
  //
  // The whole-recipe total below is every nutrient the catalog can reach. There
  // is deliberately no unsaturated fat: the catalog has no column for it (see
  // SCHEMA_NUTRITION_MAP), so that label row is unreachable by design.
  const makeFull = () =>
    makeNutritionRecipe({
      calories_kcal: 2080,
      protein_g: 88,
      fat_g: 60,
      saturated_fat_g: 24,
      carbs_g: 200,
      fiber_g: 32,
      sugars_g: 48,
      sodium_mg: 3200,
      cholesterol_mg: 240,
    });

  it("lands on the summary grid, not the label", () => {
    render(<Harness initial={makeFull()} />);
    expect(screen.getByText("Carbs")).toBeTruthy();
    // "Amount per serving" is the label's eyebrow — label-only, so it's the
    // marker for which view is showing. (The label has no title of its own.)
    expect(screen.queryByText("Amount per serving")).toBeNull();
  });

  it("swaps the grid for the full label, showing the nutrients the grid drops", () => {
    render(<Harness initial={makeFull()} />);
    fireEvent.click(screen.getByRole("button", { name: "Full label" }));

    expect(screen.getByText("Amount per serving")).toBeTruthy();
    // The grid's curated six omit these entirely; the label is the only way to
    // see them.
    expect(screen.getByText("Total Sugars")).toBeTruthy();
    expect(screen.getByText("Saturated Fat")).toBeTruthy();
    expect(screen.getByText("Cholesterol")).toBeTruthy();
    // ...and the grid itself is gone.
    expect(screen.queryByText("Carbs")).toBeNull();
  });

  it("omits unsaturated fat, which the catalog has no column for", () => {
    render(<Harness initial={makeFull()} />);
    fireEvent.click(screen.getByRole("button", { name: "Full label" }));
    expect(screen.queryByText("Unsaturated Fat")).toBeNull();
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
    // "Amount per serving" is the label's eyebrow — label-only, so it's the
    // marker for which view is showing. (The label has no title of its own.)
    expect(screen.queryByText("Amount per serving")).toBeNull();
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

    // Unit-less: on the label Calories is the big display number.
    expect(screen.getByText("260")).toBeTruthy();
    expect(screen.getAllByText("per portion")).toHaveLength(2);
    // Still in label view — a portion change must not reset the toggle.
    expect(screen.getByText("Amount per serving")).toBeTruthy();
  });

  it("stays available on a sparse recipe, where the em dashes are the signal", () => {
    const r = makeNutritionRecipe({ calories_kcal: 1400 });
    render(<Harness initial={r} />);
    fireEvent.click(screen.getByRole("button", { name: "Full label" }));
    // Calories is the label's big display number, so it drops its unit.
    expect(screen.getByText("350")).toBeTruthy();
    // Untracked nutrients are omitted, not dashed — the label shows only what
    // this recipe actually carries.
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText("Total Fat")).toBeNull();
  });

  it("offers no toggle in the no-nutrition shell", () => {
    const r = makeNutritionRecipe({}, { fullyCovered: false });
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
    const r = makeNutritionRecipe({ calories_kcal: 1400 });
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

  it("renders a shell with the link when nothing resolves", () => {
    const r = makeNutritionRecipe({}, { fullyCovered: false });
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
    const r = makeNutritionRecipe({}, { fullyCovered: false });
    const { container } = render(
      <NutritionPanel recipe={r} onSplitPortions={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
