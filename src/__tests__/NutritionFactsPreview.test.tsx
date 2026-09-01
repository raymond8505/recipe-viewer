import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import NutritionFactsPreview from "@/components/ingredients/NutritionFactsPreview";

// Draft-shaped inputs (strings), mirroring cumin's catalog figures.
const cuminNutrition = {
  calories_kcal: "375",
  protein_g: "17.81",
  sodium_mg: "168",
};

const cuminPortions = [
  { label: "tsp, whole", grams: "2.1" },
  { label: "tbsp, whole", grams: "6" },
];

function renderPreview(overrides?: {
  nutrition?: Record<string, string>;
  portions?: { label: string; grams: string }[];
}) {
  return render(
    <NutritionFactsPreview
      nutrition={overrides?.nutrition ?? cuminNutrition}
      portions={overrides?.portions ?? cuminPortions}
      idPrefix="cumin seed"
    />,
  );
}

const select = () => screen.getByLabelText("Nutrition label portion for cumin seed");

describe("NutritionFactsPreview", () => {
  it("defaults to the 100 g baseline and shows per-100 g values", () => {
    renderPreview();

    expect(select()).toHaveValue("100g");
    expect(screen.getByText("375")).toBeInTheDocument();
    expect(screen.getByText("168 mg")).toBeInTheDocument();
  });

  it("rescales the label when a portion is selected", () => {
    renderPreview();

    fireEvent.change(select(), { target: { value: "p1" } });

    // 375 kcal × 6 g / 100 g = 22.5 → display-rounds to 23.
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.queryByText("375")).not.toBeInTheDocument();
    // 168 mg sodium × 0.06 = 10.08 → 10 mg.
    expect(screen.getByText("10 mg")).toBeInTheDocument();
  });

  it("falls back to the baseline when the selected portion is removed", () => {
    const { rerender } = renderPreview();
    fireEvent.change(select(), { target: { value: "p1" } });
    expect(screen.getByText("23")).toBeInTheDocument();

    rerender(
      <NutritionFactsPreview
        nutrition={cuminNutrition}
        portions={[cuminPortions[0]]}
        idPrefix="cumin seed"
      />,
    );

    expect(select()).toHaveValue("100g");
    expect(screen.getByText("375")).toBeInTheDocument();
  });

  it("falls back when the selected portion's grams are blanked mid-edit", () => {
    const { rerender } = renderPreview();
    fireEvent.change(select(), { target: { value: "p1" } });

    rerender(
      <NutritionFactsPreview
        nutrition={cuminNutrition}
        portions={[cuminPortions[0], { label: "tbsp, whole", grams: "" }]}
        idPrefix="cumin seed"
      />,
    );

    expect(select()).toHaveValue("100g");
    expect(screen.getByText("375")).toBeInTheDocument();
  });

  it("renders em dashes for absent nutrients, never zeros", () => {
    renderPreview({ nutrition: { calories_kcal: "", fat_g: "oops" } });

    // Calories, all 8 panel rows, and the 3 mineral rows are absent:
    // 12 dashes, no fabricated 0 values.
    expect(screen.getAllByText("—")).toHaveLength(12);
    expect(screen.queryByText(/^0/)).not.toBeInTheDocument();
  });
});
