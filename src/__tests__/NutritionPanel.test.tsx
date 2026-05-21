import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import NutritionPanel, { scaleNutrientValue } from "@/components/NutritionPanel";
import { ScalableRecipe } from "@/lib/ScalableRecipe";
import type { SchemaRecipe } from "@/types/recipe";

type Nutrition = NonNullable<SchemaRecipe["nutrition"]>;

function makeRecipe(nutrition: Nutrition, baseServings: number | null) {
  const schema: SchemaRecipe = {
    name: "test",
    recipeYield: baseServings != null ? `${baseServings} servings` : undefined,
    nutrition,
  };
  return new ScalableRecipe(schema);
}

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
    const r = makeRecipe({ calories: "350 kcal", proteinContent: "20g" }, 4);
    render(<Harness initial={r} />);
    expect(screen.getByText("Nutrition")).toBeTruthy();
    expect(screen.getByText("350 kcal")).toBeTruthy();
    expect(screen.getByText("20g")).toBeTruthy();
  });

  it("returns null when no countable nutrition data is present", () => {
    const r = makeRecipe({ servingSize: "1 cup" }, 4);
    const { container } = render(<Harness initial={r} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows 'per serving' at the default portion count", () => {
    const r = makeRecipe({ calories: "350 kcal" }, 4);
    render(<Harness initial={r} />);
    expect(screen.getByText("per serving")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("shows unscaled values at the default portion count", () => {
    const r = makeRecipe({ calories: "350 kcal" }, 4);
    render(<Harness initial={r} />);
    expect(screen.getByText("350 kcal")).toBeTruthy();
  });

  it("scales values and flips to 'per portion' when portions differ from servings", () => {
    // 4 servings, 350 kcal per serving; split into 2 portions → each portion is 2 servings → 700 kcal.
    const r = makeRecipe({ calories: "350 kcal" }, 4);
    render(<Harness initial={r} />);
    fireEvent.click(screen.getByRole("button", { name: /fewer portions/i }));
    fireEvent.click(screen.getByRole("button", { name: /fewer portions/i }));
    expect(screen.getByText("per portion")).toBeTruthy();
    expect(screen.getByText("700 kcal")).toBeTruthy();
  });

  it("increases portions and scales down per-portion values", () => {
    // 4 servings, 400 kcal each; split into 8 portions → each is half a serving → 200 kcal.
    const r = makeRecipe({ calories: "400 kcal" }, 4);
    render(<Harness initial={r} />);
    const more = screen.getByRole("button", { name: /more portions/i });
    fireEvent.click(more);
    fireEvent.click(more);
    fireEvent.click(more);
    fireEvent.click(more);
    expect(screen.getByText("per portion")).toBeTruthy();
    expect(screen.getByText("200 kcal")).toBeTruthy();
  });

  it("disables decrease button at minimum of 1 portion", () => {
    const r = makeRecipe({ calories: "300 kcal" }, 4);
    render(<Harness initial={r} />);
    const decreaseBtn = screen.getByRole("button", { name: /fewer portions/i });
    fireEvent.click(decreaseBtn);
    fireEvent.click(decreaseBtn);
    fireEvent.click(decreaseBtn);
    expect(decreaseBtn).toBeDisabled();
  });

  it("hides stepper when recipe has no parsed yield", () => {
    const r = makeRecipe({ calories: "350 kcal" }, null);
    render(<Harness initial={r} />);
    expect(screen.queryByRole("button", { name: /fewer portions/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /more portions/i })).toBeNull();
    expect(screen.getByText("per serving")).toBeTruthy();
  });
});
