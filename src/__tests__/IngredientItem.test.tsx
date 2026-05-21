import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IngredientItem from "@/components/IngredientItem";
import { ScalableRecipe, type ScaledIngredient } from "@/lib/ScalableRecipe";
import type { SchemaRecipe } from "@/types/recipe";

/** Build a ScaledIngredient at scale=1 from a single ingredient string. */
function makeIngredient(text: string, scale = 1): ScaledIngredient {
  const schema: SchemaRecipe = {
    name: "test",
    recipeYield: "1 serving",
    recipeIngredient: [text],
  };
  const r = new ScalableRecipe(schema, { ingredientScale: scale });
  return r.ingredients[0];
}

describe("IngredientItem — rendering", () => {
  it("renders amount and rest for unit-less ingredients", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("3 large eggs")} />);
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("large eggs");
  });

  it("renders plain text for ingredients with no amount", () => {
    render(<IngredientItem ingredient={makeIngredient("salt and pepper to taste")} />);
    expect(screen.getByText("salt and pepper to taste")).toBeTruthy();
  });

  it("renders amount and unit select for convertable ingredient", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("2 cups flour")} />);
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("flour");
    const select = screen.getByRole("combobox", { name: "unit" });
    expect((select as HTMLSelectElement).value).toBe("cup");
  });

  it("converts amount when unit changes", () => {
    render(<IngredientItem ingredient={makeIngredient("1 tbsp butter")} />);
    const select = screen.getByRole("combobox", { name: "unit" });
    fireEvent.change(select, { target: { value: "tsp" } });
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows unicode fraction for fractional amounts", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("1/2 cup milk")} />);
    expect(container.textContent).toContain("½");
  });

  it("includes all volume units as options", () => {
    render(<IngredientItem ingredient={makeIngredient("1 cup water")} />);
    const select = screen.getByRole("combobox", { name: "unit" }) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("tsp");
    expect(values).toContain("tbsp");
    expect(values).toContain("cup");
    expect(values).toContain("ml");
    expect(values).toContain("l");
  });

  it("includes all weight units as options for weight ingredients", () => {
    render(<IngredientItem ingredient={makeIngredient("200 g butter")} />);
    const select = screen.getByRole("combobox", { name: "unit" }) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("oz");
    expect(values).toContain("lb");
    expect(values).toContain("g");
    expect(values).toContain("kg");
    expect(values).not.toContain("cup");
  });

  it("renders rest text after the unit", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("1 tsp vanilla extract")} />);
    expect(container.textContent).toContain("vanilla extract");
  });

  it("renders ingredient with no rest text", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("1 cup")} />);
    expect(container.textContent).not.toContain("undefined");
    expect(container.textContent).not.toContain("null");
  });

  it("renders range amounts with hyphen", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("3-5 cloves garlic")} />);
    expect(container.textContent).toContain("3-5");
    expect(container.textContent).toContain("cloves garlic");
  });
});

describe("IngredientItem — scaling", () => {
  it("doubles the displayed amount when scaled 2x", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("1 cup flour", 2)} />);
    expect(container.textContent).toContain("2");
  });

  it("halves the displayed amount when scaled 0.5x", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("2 cups flour", 0.5)} />);
    expect(container.textContent).toContain("1");
  });

  it("shows unicode fraction for scaled fractional amount", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("1 cup milk", 0.5)} />);
    expect(container.textContent).toContain("½");
  });

  it("scales both ends of a range", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("3-5 cloves garlic", 2)} />);
    expect(container.textContent).toContain("6-10");
  });
});

describe("IngredientItem — anchor (editing)", () => {
  it("amount is clickable when onAnchor is provided", () => {
    const onAnchor = vi.fn();
    render(<IngredientItem ingredient={makeIngredient("2 cups flour")} onAnchor={onAnchor} />);
    expect(screen.getByRole("button", { name: /edit amount/i })).toBeTruthy();
  });

  it("does not show editable amount when onAnchor is not provided", () => {
    render(<IngredientItem ingredient={makeIngredient("2 cups flour")} />);
    expect(screen.queryByRole("button", { name: /edit amount/i })).toBeNull();
  });

  it("shows input on amount click and calls onAnchor on Enter", () => {
    const onAnchor = vi.fn();
    render(<IngredientItem ingredient={makeIngredient("2 cups flour")} onAnchor={onAnchor} />);
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAnchor).toHaveBeenCalledWith(4);
  });

  it("accepts ASCII fraction input '1/2'", () => {
    const onAnchor = vi.fn();
    render(<IngredientItem ingredient={makeIngredient("1 cup milk")} onAnchor={onAnchor} />);
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "1/2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAnchor).toHaveBeenCalledWith(0.5);
  });

  it("accepts unicode fraction input '½'", () => {
    const onAnchor = vi.fn();
    render(<IngredientItem ingredient={makeIngredient("1 cup milk")} onAnchor={onAnchor} />);
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "½" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAnchor).toHaveBeenCalledWith(0.5);
  });

  it("accepts unicode mixed input '1½'", () => {
    const onAnchor = vi.fn();
    render(<IngredientItem ingredient={makeIngredient("1 cup milk")} onAnchor={onAnchor} />);
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "1½" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAnchor).toHaveBeenCalledWith(1.5);
  });

  it("rejects range input on a single-source ingredient", () => {
    const onAnchor = vi.fn();
    render(<IngredientItem ingredient={makeIngredient("2 cups flour")} onAnchor={onAnchor} />);
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "1-3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAnchor).not.toHaveBeenCalled();
  });

  it("passes anchor amount in BASE unit when display unit was changed", () => {
    const onAnchor = vi.fn();
    render(<IngredientItem ingredient={makeIngredient("1 cup water")} onAnchor={onAnchor} />);
    const select = screen.getByRole("combobox", { name: "unit" });
    fireEvent.change(select, { target: { value: "tsp" } });
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    const input = screen.getByRole("textbox");
    // 1 cup = ~48 tsp; type 96 (double) → onAnchor receives 2 (cups)
    fireEvent.change(input, { target: { value: "96" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAnchor).toHaveBeenCalledWith(expect.closeTo(2, 0));
  });

  it("cancels edit on Escape without calling onAnchor", () => {
    const onAnchor = vi.fn();
    render(<IngredientItem ingredient={makeIngredient("2 cups flour")} onAnchor={onAnchor} />);
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onAnchor).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /edit amount/i })).toBeTruthy();
  });

  it("amount click does not bubble to parent when onAnchor is provided", () => {
    const parentClick = vi.fn();
    const onAnchor = vi.fn();
    render(
      <div onClick={parentClick}>
        <IngredientItem ingredient={makeIngredient("2 cups flour")} onAnchor={onAnchor} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    expect(parentClick).not.toHaveBeenCalled();
  });
});
