import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IngredientItem from "@/components/IngredientItem";

describe("IngredientItem", () => {
  it("renders amount and rest for unit-less ingredients", () => {
    const { container } = render(<IngredientItem ingredient="3 large eggs" />);
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("large eggs");
  });

  it("renders plain text for ingredients with no amount", () => {
    render(<IngredientItem ingredient="salt and pepper to taste" />);
    expect(screen.getByText("salt and pepper to taste")).toBeTruthy();
  });

  it("renders amount and unit select for convertable ingredient", () => {
    const { container } = render(<IngredientItem ingredient="2 cups flour" />);
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("flour");
    const select = screen.getByRole("combobox", { name: "unit" });
    expect((select as HTMLSelectElement).value).toBe("cup");
  });

  it("converts amount when unit changes", () => {
    render(<IngredientItem ingredient="1 tbsp butter" />);
    const select = screen.getByRole("combobox", { name: "unit" });
    fireEvent.change(select, { target: { value: "tsp" } });
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows unicode fraction for fractional amounts", () => {
    const { container } = render(<IngredientItem ingredient="1/2 cup milk" />);
    expect(container.textContent).toContain("½");
  });

  it("includes all volume units as options", () => {
    render(<IngredientItem ingredient="1 cup water" />);
    const select = screen.getByRole("combobox", { name: "unit" }) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("tsp");
    expect(values).toContain("tbsp");
    expect(values).toContain("cup");
    expect(values).toContain("ml");
    expect(values).toContain("l");
  });

  it("includes all weight units as options for weight ingredients", () => {
    render(<IngredientItem ingredient="200 g butter" />);
    const select = screen.getByRole("combobox", { name: "unit" }) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("oz");
    expect(values).toContain("lb");
    expect(values).toContain("g");
    expect(values).toContain("kg");
    expect(values).not.toContain("cup");
  });

  it("renders rest text after the unit", () => {
    const { container } = render(<IngredientItem ingredient="1 tsp vanilla extract" />);
    expect(container.textContent).toContain("vanilla extract");
  });

  it("renders ingredient with no rest text", () => {
    const { container } = render(<IngredientItem ingredient="1 cup" />);
    expect(container.textContent).not.toContain("undefined");
    expect(container.textContent).not.toContain("null");
  });
});

describe("IngredientItem — scaling", () => {
  it("doubles the displayed amount when scale=2", () => {
    const { container } = render(<IngredientItem ingredient="1 cup flour" scale={2} />);
    expect(container.textContent).toContain("2");
  });

  it("halves the displayed amount when scale=0.5", () => {
    const { container } = render(<IngredientItem ingredient="2 cups flour" scale={0.5} />);
    expect(container.textContent).toContain("1");
  });

  it("shows unicode fraction for scaled fractional amount", () => {
    const { container } = render(<IngredientItem ingredient="1 cup milk" scale={0.5} />);
    expect(container.textContent).toContain("½");
  });

  it("amount is clickable when onScaleChange is provided", () => {
    const onScaleChange = vi.fn();
    render(<IngredientItem ingredient="2 cups flour" onScaleChange={onScaleChange} />);
    const amountBtn = screen.getByRole("button", { name: /edit amount/i });
    expect(amountBtn).toBeTruthy();
  });

  it("shows input on amount click and calls onScaleChange on Enter", () => {
    const onScaleChange = vi.fn();
    render(<IngredientItem ingredient="2 cups flour" onScaleChange={onScaleChange} />);
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onScaleChange).toHaveBeenCalledWith(2); // 4 / 2 = scale 2
  });

  it("calls onScaleChange with correct ratio when unit is changed before editing", () => {
    const onScaleChange = vi.fn();
    render(<IngredientItem ingredient="1 cup water" onScaleChange={onScaleChange} />);
    // switch to tsp (1 cup = ~48 tsp)
    const select = screen.getByRole("combobox", { name: "unit" });
    fireEvent.change(select, { target: { value: "tsp" } });
    // click the amount to edit it
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    const input = screen.getByRole("spinbutton");
    // 1 cup = ~48 tsp; type 96 (double)
    fireEvent.change(input, { target: { value: "96" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // newScale = 96 / 48 = 2
    expect(onScaleChange).toHaveBeenCalledWith(expect.closeTo(2, 0));
  });

  it("does not show editable amount when onScaleChange is not provided", () => {
    render(<IngredientItem ingredient="2 cups flour" />);
    expect(screen.queryByRole("button", { name: /edit amount/i })).toBeNull();
  });

  it("cancels edit on Escape without calling onScaleChange", () => {
    const onScaleChange = vi.fn();
    render(<IngredientItem ingredient="2 cups flour" onScaleChange={onScaleChange} />);
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "Escape" });
    expect(onScaleChange).not.toHaveBeenCalled();
    // amount button should be back
    expect(screen.getByRole("button", { name: /edit amount/i })).toBeTruthy();
  });

  it("amount click does not bubble to parent when onScaleChange is provided", () => {
    const parentClick = vi.fn();
    const onScaleChange = vi.fn();
    const { container } = render(
      <div onClick={parentClick}>
        <IngredientItem ingredient="2 cups flour" onScaleChange={onScaleChange} />
      </div>
    );
    void container; // suppress unused warning
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    expect(parentClick).not.toHaveBeenCalled();
  });
});
