import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import IngredientCreateForm from "@/components/ingredients/IngredientCreateForm";
import { createIngredient } from "@/lib/api/ingredients";
import { makeIngredient } from "@/fixtures";

vi.mock("@/lib/api/ingredients", () => ({ createIngredient: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createIngredient).mockResolvedValue(
    makeIngredient("new-1", "gochujang", { source: "manual" }),
  );
});

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("IngredientCreateForm", () => {
  it("splits the aliases input into an array and seeds the default 100 g portion", async () => {
    const onCreated = vi.fn();
    render(<IngredientCreateForm onCreated={onCreated} />);

    fill("New ingredient name", "kosher salt");
    fill("New ingredient aliases", "flaky salt, sea salt");
    // Entered against the default 100 g portion → stored verbatim (identity).
    fill("Calories (kcal) for new ingredient", "375");

    fireEvent.click(screen.getByRole("button", { name: "Create ingredient" }));

    await waitFor(() => {
      expect(createIngredient).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "kosher salt",
          source: "manual",
          aliases: ["flaky salt", "sea salt"],
          food_portions: [{ gramWeight: 100 }],
          nutrition: { calories_kcal: 375 },
        }),
      );
    });
    expect(onCreated).toHaveBeenCalled();
  });

  it("scales nutrition entered against a non-100 g portion up to per-100g", async () => {
    render(<IngredientCreateForm onCreated={vi.fn()} />);

    fill("New ingredient name", "peanut butter");
    // Redefine the basis portion as a 30 g serving...
    fill("New ingredient portion 1 label", "serving");
    fill("New ingredient portion 1 grams", "30");
    // ...and enter 120 kcal against it → 400 kcal / 100 g.
    fill("Calories (kcal) for new ingredient", "120");

    fireEvent.click(screen.getByRole("button", { name: "Create ingredient" }));

    await waitFor(() => {
      expect(createIngredient).toHaveBeenCalledWith(
        expect.objectContaining({
          food_portions: [{ modifier: "serving", gramWeight: 30 }],
          nutrition: { calories_kcal: 400 },
        }),
      );
    });
  });

  it("does not submit without a name", () => {
    render(<IngredientCreateForm onCreated={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Create ingredient" }));

    expect(createIngredient).not.toHaveBeenCalled();
  });
});
