import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NutritionFactsLabel from "@/components/nutrition/NutritionFactsLabel";
import {
  ingredientNutritionRows,
  recipeNutritionRows,
} from "@/components/nutrition/labelRows";
import { schemaNutritionToValues } from "@/lib/nutritionMath";

const fullRecipe = recipeNutritionRows(
  schemaNutritionToValues({
    calories: "520 kcal",
    proteinContent: "32 g",
    carbohydrateContent: "48 g",
    fatContent: "18 g",
    fiberContent: "6 g",
    sodiumContent: "820 mg",
    sugarContent: "10 g",
    saturatedFatContent: "5 g",
    unsaturatedFatContent: "8 g",
    cholesterolContent: "50 mg",
  }),
);

describe("NutritionFactsLabel", () => {
  it("renders every row in FDA panel order", () => {
    const { container } = render(
      <NutritionFactsLabel
        data={fullRecipe}
        servingLabel="per serving"
        layout="tabular"
      />,
    );
    // Document order is the vertical panel's order, which is also what the
    // tabular columns re-arrange — so asserting it covers both layouts.
    const text = container.textContent!;
    const order = [
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
    // No minerals: the recipe side has no Schema.org slot for them, so they're
    // never emitted. Their order is covered by the catalog case below.
    let cursor = 0;
    for (const name of order) {
      const at = text.indexOf(name, cursor);
      expect(at, `${name} missing or out of order`).toBeGreaterThan(-1);
      cursor = at + name.length;
    }
  });

  it("strips the unit from Calories so it reads as the big display number", () => {
    render(<NutritionFactsLabel data={fullRecipe} servingLabel="per serving" />);
    expect(screen.getByText("520")).toBeTruthy();
    expect(screen.queryByText("520 kcal")).toBeNull();
  });

  it("keeps each other nutrient's own unit", () => {
    render(<NutritionFactsLabel data={fullRecipe} servingLabel="per serving" />);
    expect(screen.getByText("820 mg")).toBeTruthy();
    expect(screen.getByText("32 g")).toBeTruthy();
  });

  it("omits untracked nutrients rather than dashing them", () => {
    // A real package label lists what was measured; a column of dashes reads as
    // broken rather than as "unknown".
    const sparse = recipeNutritionRows(
      schemaNutritionToValues({ calories: "350 kcal", proteinContent: "22 g" }),
    );
    render(<NutritionFactsLabel data={sparse} servingLabel="per serving" />);
    expect(screen.getByText("350")).toBeTruthy();
    expect(screen.getByText("22 g")).toBeTruthy();
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText("0 g")).toBeNull();
    // Nothing the recipe doesn't carry survives — including the whole fats
    // group, whose rows are all absent here.
    expect(screen.queryByText("Total Fat")).toBeNull();
    expect(screen.queryByText("Dietary Fiber")).toBeNull();
  });

  it("drops a section entirely when every row in it is untracked", () => {
    // The minerals have no Schema.org slot, so the recipe side never has them —
    // the closing section rule must go with them, not leave a stray bar.
    const { container } = render(
      <NutritionFactsLabel
        data={recipeNutritionRows(
          schemaNutritionToValues({ calories: "350 kcal" }),
        )}
        servingLabel="per serving"
      />,
    );
    expect(screen.queryByText("Potassium")).toBeNull();
    expect(screen.queryByText("Calcium")).toBeNull();
    expect(container.querySelectorAll(".border-t-2")).toHaveLength(1); // the brand Calories rule only
  });

  it("hides the Calories block when calories is untracked", () => {
    const { container } = render(
      <NutritionFactsLabel
        data={recipeNutritionRows(
          schemaNutritionToValues({ proteinContent: "22 g" }),
        )}
        servingLabel="per serving"
      />,
    );
    expect(screen.queryByText("Calories")).toBeNull();
    expect(screen.queryByText("Amount per serving")).toBeNull();
    expect(screen.getByText("22 g")).toBeTruthy();
    // The brand accent rule belongs to that block and leaves with it.
    expect(container.querySelector(".border-brand")).toBeNull();
  });

  it("shows the serving caption only when one is given", () => {
    const { rerender } = render(
      <NutritionFactsLabel
        data={fullRecipe}
        servingLabel="100 g"
        servingCaption="Serving size"
      />,
    );
    expect(screen.getByText("Serving size")).toBeTruthy();
    expect(screen.getByText("100 g")).toBeTruthy();

    // The recipe label omits it: nutritionUnitLabel is already a phrase, so a
    // caption would read "Serving size: per 114 g serving".
    rerender(
      <NutritionFactsLabel data={fullRecipe} servingLabel="per 114 g serving" />,
    );
    expect(screen.queryByText("Serving size")).toBeNull();
    expect(screen.getByText("per 114 g serving")).toBeTruthy();
  });

  it("renders one DOM copy of each name, both layouts", () => {
    // The responsive fallback re-arranges children rather than duplicating
    // markup — a second hidden copy would break getByText everywhere.
    render(
      <NutritionFactsLabel
        data={fullRecipe}
        servingLabel="per serving"
        layout="tabular"
      />,
    );
    expect(screen.getAllByText("Sodium")).toHaveLength(1);
    expect(screen.getAllByText("Protein")).toHaveLength(1);
  });

  it("carries both the full and abbreviated wording only in tabular", () => {
    // Tabular swaps to FDA abbreviations once the container is wide enough, so
    // both strings must be present; vertical needs only the full name.
    const { container, rerender } = render(
      <NutritionFactsLabel
        data={fullRecipe}
        servingLabel="per serving"
        layout="tabular"
      />,
    );
    expect(container.textContent).toContain("Total Carbohydrate");
    expect(container.textContent).toContain("Total Carb.");

    rerender(
      <NutritionFactsLabel
        data={fullRecipe}
        servingLabel="per serving"
        layout="vertical"
      />,
    );
    expect(container.textContent).toContain("Total Carbohydrate");
    expect(container.textContent).not.toContain("Total Carb.");
  });

  it("renders no title of its own", () => {
    // Both callers render a heading directly above the label (the panel's
    // "Nutrition", the catalog drawer's "Label preview"), so a "Nutrition
    // Facts" title only ever read as a duplicate.
    render(<NutritionFactsLabel data={fullRecipe} servingLabel="per serving" />);
    expect(screen.queryByText("Nutrition Facts")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("renders real mineral values on the catalog side", () => {
    // Same component, same rows — only the adapter differs, which is the whole
    // point of sharing the row model.
    render(
      <NutritionFactsLabel
        data={ingredientNutritionRows({
          calories_kcal: 375,
          potassium_mg: 1788,
          iron_mg: 66.4,
        })}
        servingLabel="100 g"
        servingCaption="Serving size"
      />,
    );
    expect(screen.getByText("1788 mg")).toBeTruthy();
    expect(screen.getByText("66 mg")).toBeTruthy();
  });
});
