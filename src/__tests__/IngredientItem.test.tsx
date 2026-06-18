import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IngredientItem from "@/components/IngredientItem";
import { makeScaledIngredient as makeIngredient } from "@/fixtures";

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

  it("shows fractional amounts as 1-decimal values", () => {
    // 1/2 cup = 118.3 ml > 60 → threshold default is cups; renders as "0.5"
    const { container } = render(<IngredientItem ingredient={makeIngredient("1/2 cup milk")} />);
    expect(container.textContent).toContain("0.5");
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

describe("IngredientItem — threshold-default unit and hint", () => {
  it("promotes 90 ml to cup by default (90 > 60 → cup; cup → 0.38)", () => {
    // 90 ml > 60 ml → threshold default is cup. 90 ml = 0.38 cup → "0.38".
    // The closest common cup fraction is ⅓ → hint shows.
    const { container } = render(
      <IngredientItem ingredient={makeIngredient("90 ml distilled white vinegar")} />,
    );
    expect(container.textContent).toContain("0.38");
    const select = screen.getByRole("combobox", { name: "unit" }) as HTMLSelectElement;
    expect(select.value).toBe("cup");
    expect(container.textContent).toContain("⅓");
  });

  it("promotes 30 ml to tbsp by default (7 ≤ 30 ≤ 60 → tbsp)", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("30 ml vinegar")} />);
    const select = screen.getByRole("combobox", { name: "unit" }) as HTMLSelectElement;
    expect(select.value).toBe("tbsp");
    // 30 ml = 2.03 tbsp → "2.03"; hint "2 tbsp" → suppressed (redundant)
    expect(container.textContent).toContain("2.03");
  });

  it("renders a quarter teaspoon as 0.25, not 0.3", () => {
    // ¼ tsp = 0.25; 2-dp formatting keeps the quarter instead of rounding to 0.3.
    const { container } = render(
      <IngredientItem ingredient={makeIngredient("¼ tsp everything bagel seasoning")} />,
    );
    expect(container.textContent).toContain("0.25");
    expect(container.textContent).not.toContain("0.3");
  });

  it("pre-fills the edit input with 0.25 for a quarter teaspoon (no anchor drift)", () => {
    // The edit input seeds from the displayed value; with 0.25 (not 0.3),
    // committing unchanged is a no-op instead of rescaling the recipe 1.2×.
    render(
      <IngredientItem
        ingredient={makeIngredient("¼ tsp everything bagel seasoning")}
        onAnchor={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("0.25");
  });

  it("uses tsp for small volumes (< 7 ml)", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("5 ml extract")} />);
    const select = screen.getByRole("combobox", { name: "unit" }) as HTMLSelectElement;
    expect(select.value).toBe("tsp");
    // 5 ml = 1.01 tsp → "1.01"
    expect(container.textContent).toContain("1.01");
  });

  it("suppresses hint when displayed decimal already matches the common fraction", () => {
    // 120 ml = 0.51 cup; threshold = cup; rounds to the same 1-dp value as
    // ½ cup, so the "½ cup" hint is suppressed as redundant.
    const { container } = render(<IngredientItem ingredient={makeIngredient("120 ml water")} />);
    expect(container.textContent).toContain("0.51");
    expect(container.textContent).not.toContain("≈");
  });

  it("shows hint in threshold unit when user picks a different display unit", () => {
    // Default for 90 ml is cup. User picks ml → display "90 ml" but hint stays "⅓ cup".
    const { container } = render(<IngredientItem ingredient={makeIngredient("90 ml vinegar")} />);
    const select = screen.getByRole("combobox", { name: "unit" }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "ml" } });
    expect(container.textContent).toContain("90");
    expect(container.textContent).toContain("⅓");
    expect(container.textContent).toContain("cup");
  });

  it("does not show a hint for non-volume ingredients", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("200 g butter")} />);
    expect(container.textContent).toContain("200");
    expect(container.textContent).not.toContain("≈");
  });

  it("does not show a hint for ranges", () => {
    const { container } = render(<IngredientItem ingredient={makeIngredient("1-2 tsp salt")} />);
    expect(container.textContent).toContain("1-2");
    expect(container.textContent).not.toContain("≈");
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

  it("shows scaled fractional amount as 1-decimal value", () => {
    // 1 cup × 0.5 = 0.5 cup = 118.3 ml → threshold cups → "0.5"
    const { container } = render(<IngredientItem ingredient={makeIngredient("1 cup milk", 0.5)} />);
    expect(container.textContent).toContain("0.5");
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

  // The anchor commits a single scale multiplier, so range input ("1-3") is
  // never a valid edit — regardless of whether the source ingredient parses
  // as a single value or a range.
  it("rejects range input (anchor accepts a single value only)", () => {
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

  it("pre-fills the edit input with the midpoint when source is a range", () => {
    // "3-5 cloves" displays as range; clicking edit opens the input with "4"
    // (midpoint) — not "3-5", which commitEdit would silently reject.
    render(
      <IngredientItem
        ingredient={makeIngredient("3-5 cloves garlic")}
        onAnchor={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("4");
  });

  it("pre-fills the edit input with the midpoint of the SCALED range", () => {
    // "3-5" at 2× → displayed "6-10"; pre-fill midpoint = 8.
    render(
      <IngredientItem
        ingredient={makeIngredient("3-5 cloves garlic", 2)}
        onAnchor={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("8");
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
