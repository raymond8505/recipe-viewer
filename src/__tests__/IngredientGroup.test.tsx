import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IngredientGroup from "@/components/IngredientGroup";
import { makeScalableRecipe } from "@/fixtures";

// scalableBaseIngredients: [0] four nameless lines, [1] "Wet" — "1 cup butter", "1/4 cup sugar".
const [nameless, wet] = makeScalableRecipe().groupedIngredients;

describe("IngredientGroup", () => {
  it("renders a named group's heading with the caller's className", () => {
    render(
      <IngredientGroup
        group={wet}
        isSelected={() => false}
        onToggle={() => {}}
        headingClassName="text-sm sm:text-xs"
      />,
    );
    const heading = screen.getByRole("heading", { level: 3, name: "Wet" });
    expect(heading).toHaveClass("text-sm", "sm:text-xs");
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("renders no heading for the nameless group", () => {
    render(<IngredientGroup group={nameless} isSelected={() => false} onToggle={() => {}} />);
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });

  it("asks isSelected for each row's checked state", () => {
    render(
      <IngredientGroup
        group={wet}
        isSelected={(ing) => ing.original === "1 cup butter"}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "1 cup butter" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: "1/4 cup sugar" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("hands onToggle the clicked ingredient", () => {
    const onToggle = vi.fn();
    render(<IngredientGroup group={wet} isSelected={() => false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "1/4 cup sugar" }));
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ original: "1/4 cup sugar" }));
  });

  it("hands onAnchor the ingredient and the committed amount", () => {
    const onAnchor = vi.fn();
    render(
      <IngredientGroup
        group={wet}
        isSelected={() => false}
        onToggle={() => {}}
        onAnchor={onAnchor}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit amount for butter/i }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAnchor).toHaveBeenCalledWith(expect.objectContaining({ index: 4 }), 3);
  });

  it("renders read-only amounts without onAnchor", () => {
    render(<IngredientGroup group={wet} isSelected={() => false} onToggle={() => {}} />);
    expect(screen.queryByRole("button", { name: /edit amount/i })).toBeNull();
  });

  it("hands itemClassName to every row", () => {
    render(
      <IngredientGroup
        group={wet}
        isSelected={() => false}
        onToggle={() => {}}
        itemClassName="text-lg"
      />,
    );
    for (const row of screen.getAllByRole("checkbox")) expect(row).toHaveClass("text-lg");
  });
});
