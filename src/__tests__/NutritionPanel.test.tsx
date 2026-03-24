import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NutritionPanel, { scaleNutrientValue } from "@/components/NutritionPanel";

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
    render(
      <NutritionPanel
        nutrition={{ calories: "350 kcal", proteinContent: "20g" }}
        totalServings={4}
      />
    );
    expect(screen.getByText("Nutrition")).toBeTruthy();
    expect(screen.getByText("350 kcal")).toBeTruthy();
    expect(screen.getByText("20g")).toBeTruthy();
  });

  it("returns null when no countable nutrition data is present", () => {
    const { container } = render(
      <NutritionPanel nutrition={{ servingSize: "1 cup" }} totalServings={4} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows 'per serving' at the default portion count", () => {
    render(
      <NutritionPanel nutrition={{ calories: "350 kcal" }} totalServings={4} />
    );
    expect(screen.getByText("per serving")).toBeTruthy();
    // stepper defaults to totalServings
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("shows unscaled values when portions equals totalServings", () => {
    render(
      <NutritionPanel nutrition={{ calories: "350 kcal" }} totalServings={4} />
    );
    expect(screen.getByText("350 kcal")).toBeTruthy();
  });

  it("scales values and shows 'per portion' when portions differs from totalServings", () => {
    // 4 servings at 350 kcal = 1400 kcal total → divided into 2 portions = 700 kcal each
    render(
      <NutritionPanel nutrition={{ calories: "350 kcal" }} totalServings={4} />
    );
    fireEvent.click(screen.getByRole("button", { name: /fewer portions/i }));
    fireEvent.click(screen.getByRole("button", { name: /fewer portions/i }));
    // now at 2 portions
    expect(screen.getByText("per portion")).toBeTruthy();
    expect(screen.getByText("700 kcal")).toBeTruthy();
  });

  it("increases portions and scales down per-portion values", () => {
    // 4 servings at 400 kcal = 1600 kcal total → divided into 8 portions = 200 kcal each
    render(
      <NutritionPanel nutrition={{ calories: "400 kcal" }} totalServings={4} />
    );
    fireEvent.click(screen.getByRole("button", { name: /more portions/i }));
    fireEvent.click(screen.getByRole("button", { name: /more portions/i }));
    fireEvent.click(screen.getByRole("button", { name: /more portions/i }));
    fireEvent.click(screen.getByRole("button", { name: /more portions/i }));
    // now at 8 portions
    expect(screen.getByText("per portion")).toBeTruthy();
    expect(screen.getByText("200 kcal")).toBeTruthy();
  });

  it("disables decrease button at minimum of 1 portion", () => {
    render(
      <NutritionPanel nutrition={{ calories: "300 kcal" }} totalServings={4} />
    );
    const decreaseBtn = screen.getByRole("button", { name: /fewer portions/i });
    // click down from 4 to 1
    fireEvent.click(decreaseBtn);
    fireEvent.click(decreaseBtn);
    fireEvent.click(decreaseBtn);
    expect(decreaseBtn).toBeDisabled();
  });

  it("hides stepper when totalServings is null", () => {
    render(
      <NutritionPanel nutrition={{ calories: "350 kcal" }} totalServings={null} />
    );
    expect(screen.queryByRole("button", { name: /fewer portions/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /more portions/i })).toBeNull();
    expect(screen.getByText("per serving")).toBeTruthy();
  });
});
