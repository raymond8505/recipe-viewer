import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IngredientListItem from "@/components/IngredientListItem";
import { makeScaledIngredient } from "@/fixtures";

function renderRow(props: Partial<React.ComponentProps<typeof IngredientListItem>> = {}) {
  return render(
    <ul>
      <IngredientListItem
        ingredient={makeScaledIngredient("2 cups flour")}
        selected={false}
        onToggle={() => {}}
        {...props}
      />
    </ul>,
  );
}

describe("IngredientListItem", () => {
  it("is a native checkbox named by the line's text", () => {
    renderRow();
    const box = screen.getByRole("checkbox", { name: "2 cups flour" });
    // Native, so it is focusable and Space-operable without any tabIndex or key handler.
    expect(box.tagName).toBe("INPUT");
    expect(box).toHaveAttribute("type", "checkbox");
    expect(box).not.toBeChecked();
  });

  it("reflects the selected prop", () => {
    renderRow({ selected: true });
    expect(screen.getByRole("checkbox", { name: "2 cups flour" })).toBeChecked();
  });

  it("toggles when the checkbox is clicked", () => {
    const onToggle = vi.fn();
    renderRow({ onToggle });
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("toggles when the row-covering label is clicked", () => {
    const onToggle = vi.fn();
    const { container } = renderRow({ onToggle });
    fireEvent.click(container.querySelector("label")!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("keeps the amount button outside the checkbox, where a screen reader can reach it", () => {
    renderRow({ onAnchor: () => {} });
    const box = screen.getByRole("checkbox", { name: "2 cups flour" });
    const amount = screen.getByRole("button", { name: /edit amount/i });
    const unit = screen.getByRole("combobox", { name: "unit" });
    expect(box.contains(amount)).toBe(false);
    expect(box.contains(unit)).toBe(false);
  });

  it("does not toggle when the editable amount is clicked", () => {
    const onToggle = vi.fn();
    renderRow({ onToggle, onAnchor: () => {} });
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("does not toggle when the unit is changed", () => {
    const onToggle = vi.fn();
    renderRow({ onToggle });
    fireEvent.change(screen.getByRole("combobox", { name: "unit" }), {
      target: { value: "tbsp" },
    });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("renders a read-only amount without onAnchor", () => {
    renderRow();
    expect(screen.queryByRole("button", { name: /edit amount/i })).toBeNull();
  });

  it("applies the caller's className to the row", () => {
    renderRow({ className: "text-lg sm:text-sm" });
    expect(screen.getByRole("listitem")).toHaveClass("text-lg", "sm:text-sm");
  });
});
