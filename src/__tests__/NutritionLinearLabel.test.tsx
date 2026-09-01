import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NutritionLinearLabel from "@/components/NutritionLinearLabel";
import { schemaNutritionToValues } from "@/lib/nutritionMath";

const fullValues = schemaNutritionToValues({
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
});

describe("NutritionLinearLabel", () => {
  it("renders every nutrient in FDA panel order, Calories first", () => {
    const { container } = render(
      <NutritionLinearLabel values={fullValues} servingLabel="per serving" />,
    );
    // Read the run as flat text: the names must appear in reading order, which
    // is what makes the linear format legible next to a real package label.
    const run = container.querySelector("p")!.textContent!;
    const order = [
      "Calories",
      "Total Fat",
      "Saturated Fat",
      "Unsaturated Fat",
      "Cholesterol",
      "Sodium",
      "Total Carbohydrate",
      "Dietary Fiber",
      "Total Sugars",
      "Protein",
    ];
    let cursor = 0;
    for (const name of order) {
      const at = run.indexOf(name, cursor);
      expect(at, `${name} missing or out of order`).toBeGreaterThan(-1);
      cursor = at + name.length;
    }
  });

  it("keeps each nutrient's own unit, including Calories", () => {
    render(
      <NutritionLinearLabel values={fullValues} servingLabel="per serving" />,
    );
    expect(screen.getByText("520 kcal")).toBeTruthy();
    expect(screen.getByText("820 mg")).toBeTruthy();
    expect(screen.getByText("32 g")).toBeTruthy();
  });

  it("renders absent nutrients as an em dash, never 0", () => {
    // Key sparsity is meaningful (absent ≠ zero) and showing the empty slots is
    // the point of this view — it maps what the recipe doesn't track.
    render(
      <NutritionLinearLabel
        values={{ calories: { value: 350, unit: "kcal" } }}
        servingLabel="per serving"
      />,
    );
    expect(screen.getByText("350 kcal")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(9);
    expect(screen.queryByText("0 g")).toBeNull();
  });

  it("renders the serving label bare, with no 'Serving size' prefix", () => {
    // nutritionUnitLabel is already a prepositional phrase — a prefix would
    // read "Serving size: per 114 g serving".
    render(
      <NutritionLinearLabel
        values={fullValues}
        servingLabel="per 114 g serving"
      />,
    );
    expect(screen.getByText("per 114 g serving")).toBeTruthy();
    expect(screen.queryByText(/Serving size/)).toBeNull();
  });

  it("renders 'Nutrition Facts' as a non-heading element", () => {
    // Deliberate: the global base layer styles h1–h6 serif-light, and the label
    // title must stay sans-black like the real package label.
    render(
      <NutritionLinearLabel values={fullValues} servingLabel="per serving" />,
    );
    expect(screen.getByText("Nutrition Facts")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Nutrition Facts" }),
    ).toBeNull();
  });
});
