import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IngredientItem from "@/components/IngredientItem";

describe("IngredientItem", () => {
  it("renders plain text for non-convertable ingredients", () => {
    render(<IngredientItem ingredient="3 large eggs" />);
    expect(screen.getByText("3 large eggs")).toBeTruthy();
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
