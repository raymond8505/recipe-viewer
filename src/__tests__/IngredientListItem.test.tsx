import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import IngredientListItem from "@/components/IngredientListItem";
import { makeScaledIngredient } from "@/fixtures";

describe("IngredientListItem", () => {
  it("is a checkbox named by the line's text, checked when selected", () => {
    const { rerender } = render(
      <ul>
        <IngredientListItem
          ingredient={makeScaledIngredient("2 cups flour")}
          selected={false}
          onToggle={() => {}}
        />
      </ul>,
    );
    const row = screen.getByRole("checkbox", { name: "2 cups flour" });
    expect(row).toHaveAttribute("aria-checked", "false");

    rerender(
      <ul>
        <IngredientListItem
          ingredient={makeScaledIngredient("2 cups flour")}
          selected
          onToggle={() => {}}
        />
      </ul>,
    );
    expect(row).toHaveAttribute("aria-checked", "true");
  });

  it("toggles when the row is clicked", () => {
    const onToggle = vi.fn();
    render(
      <ul>
        <IngredientListItem
          ingredient={makeScaledIngredient("2 cups flour")}
          selected={false}
          onToggle={onToggle}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not toggle when the editable amount is clicked", () => {
    const onToggle = vi.fn();
    render(
      <ul>
        <IngredientListItem
          ingredient={makeScaledIngredient("2 cups flour")}
          selected={false}
          onToggle={onToggle}
          onAnchor={() => {}}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit amount/i }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("renders a read-only amount without onAnchor", () => {
    render(
      <ul>
        <IngredientListItem
          ingredient={makeScaledIngredient("2 cups flour")}
          selected={false}
          onToggle={() => {}}
        />
      </ul>,
    );
    expect(screen.queryByRole("button", { name: /edit amount/i })).toBeNull();
  });

  it("applies the caller's className to the row", () => {
    render(
      <ul>
        <IngredientListItem
          ingredient={makeScaledIngredient("2 cups flour")}
          selected={false}
          onToggle={() => {}}
          className="text-lg sm:text-sm"
        />
      </ul>,
    );
    expect(screen.getByRole("checkbox", { name: "2 cups flour" })).toHaveClass(
      "text-lg",
      "sm:text-sm",
    );
  });
});
