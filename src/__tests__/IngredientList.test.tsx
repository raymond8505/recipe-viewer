import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IngredientList from "@/components/IngredientList";
import { makeScalableRecipe } from "@/fixtures";

// scalableBaseIngredients: four nameless lines, then "Wet" — "1 cup butter", "1/4 cup sugar".
const groups = makeScalableRecipe().groupedIngredients;

describe("IngredientList", () => {
  it("renders every group's rows, with a heading only for named groups", () => {
    render(<IngredientList groups={groups} isSelected={() => false} onToggle={() => {}} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(["Wet"]);
  });

  it("asks isSelected for each row's checked state", () => {
    render(
      <IngredientList
        groups={groups}
        isSelected={(ing) => ing.original === "2 cups flour"}
        onToggle={() => {}}
      />,
    );
    const checked = screen
      .getAllByRole("checkbox")
      .filter((row) => row.getAttribute("aria-checked") === "true");
    expect(checked.map((row) => row.getAttribute("aria-label"))).toEqual(["2 cups flour"]);
  });

  it("hands onToggle the clicked ingredient, whichever group it sits in", () => {
    const onToggle = vi.fn();
    render(<IngredientList groups={groups} isSelected={() => false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "1 cup butter" }));
    expect(onToggle).toHaveBeenCalledWith(
      expect.objectContaining({ original: "1 cup butter", index: 4 }),
    );
  });

  it("passes the class props through to headings and rows", () => {
    render(
      <IngredientList
        groups={groups}
        isSelected={() => false}
        onToggle={() => {}}
        headingClassName="text-sm"
        itemClassName="text-lg"
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Wet" })).toHaveClass("text-sm");
    for (const row of screen.getAllByRole("checkbox")) expect(row).toHaveClass("text-lg");
  });
});
