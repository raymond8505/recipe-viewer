import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import IngredientsTable from "@/components/ingredients/IngredientsTable";
import {
  createIngredient,
  deleteIngredient,
  fetchIngredients,
  updateIngredient,
} from "@/lib/api/ingredients";
import { ingredientFixtures, makeIngredient } from "@/fixtures";
import { scaleNutritionToGrams } from "@/lib/nutritionMath";
import { formatAmount } from "@/lib/units";
import type { IngredientRow } from "@/types/ingredient";

vi.mock("@/lib/api/ingredients", () => ({
  fetchIngredients: vi.fn(),
  createIngredient: vi.fn(),
  updateIngredient: vi.fn(),
  deleteIngredient: vi.fn(),
}));

const cumin = ingredientFixtures[0]; // "cumin seed"

function renderTable(rows = ingredientFixtures.slice(0, 2)) {
  return render(
    <IngredientsTable initialIngredients={rows} initialCount={rows.length} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("IngredientsTable", () => {
  it("renders the initial rows without fetching", () => {
    renderTable();

    expect(screen.getByLabelText("Name for cumin seed")).toHaveValue("cumin seed");
    expect(screen.getByLabelText("Name for all-purpose flour")).toHaveValue(
      "all-purpose flour",
    );
    expect(fetchIngredients).not.toHaveBeenCalled();
  });

  it("shows the empty state with guidance", () => {
    renderTable([]);

    expect(screen.getByText(/No ingredients found/)).toBeInTheDocument();
  });

  it("reveals Save only for a dirty row and PATCHes just the changed fields", async () => {
    vi.mocked(updateIngredient).mockResolvedValueOnce({
      ...cumin,
      name: "whole cumin seed",
      updated_at: "2026-07-14T12:00:00.000Z",
    });
    renderTable();

    expect(screen.queryByLabelText("Save cumin seed")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Name for cumin seed"), {
      target: { value: "whole cumin seed" },
    });
    fireEvent.click(screen.getByLabelText("Save cumin seed"));

    await waitFor(() => {
      expect(updateIngredient).toHaveBeenCalledWith(cumin.id, {
        name: "whole cumin seed",
      });
    });
    // The saved row replaces the old one (fresh draft via the updated_at key).
    expect(
      await screen.findByLabelText("Name for whole cumin seed"),
    ).toHaveValue("whole cumin seed");
  });

  it("sends the full non-empty nutrition object when any nutrition cell changes", async () => {
    vi.mocked(updateIngredient).mockResolvedValueOnce({
      ...cumin,
      updated_at: "2026-07-14T12:00:00.000Z",
    });
    renderTable();

    // Editing lives in the details drawer now (the row cells are read-only).
    fireEvent.click(screen.getByLabelText("Details for cumin seed"));
    fireEvent.change(screen.getByLabelText("Calories (kcal) for cumin seed"), {
      target: { value: "400" },
    });
    fireEvent.click(screen.getByLabelText("Save cumin seed"));

    await waitFor(() => {
      expect(updateIngredient).toHaveBeenCalledWith(
        cumin.id,
        expect.objectContaining({
          nutrition: expect.objectContaining({
            calories_kcal: 400,
            // Untouched values ride along — the jsonb is replaced whole.
            protein_g: 17.81,
          }),
        }),
      );
    });
  });

  it("shows the primary nutrition as read-only, portion-scaled text; edit lives in the drawer", () => {
    renderTable();

    // The row shows nutrition scaled to the representative serving (cumin's
    // first portion, 2.1 g) — not the per-100 g figures — matching the Serving
    // column. Computed with the same helpers so the expectation can't drift.
    const scaled = scaleNutritionToGrams(cumin.nutrition!, 2.1);
    expect(
      screen.getByText(formatAmount(scaled.calories_kcal!)),
    ).toBeInTheDocument();
    // The per-100 g value (375) is NOT what the row shows.
    expect(screen.queryByText("375")).not.toBeInTheDocument();

    // The primary cells are read-only text: no editable input until expanded.
    expect(
      screen.queryByLabelText("Calories (kcal) for cumin seed"),
    ).not.toBeInTheDocument();
    // Secondary columns aren't rendered anywhere until the row is expanded.
    expect(
      screen.queryByLabelText("Sugars (g) for cumin seed"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Density (g/ml) for cumin seed"),
    ).not.toBeInTheDocument();

    // Expanding reveals the per-100 g edit inputs for every nutrient.
    fireEvent.click(screen.getByLabelText("Details for cumin seed"));
    expect(
      screen.getByLabelText("Calories (kcal) for cumin seed"),
    ).toHaveValue(375);
  });

  it("derives a read-only serving size from the USDA food portions", () => {
    renderTable();

    expect(screen.getByText("1 tsp, whole ≈ 2.1 g")).toBeInTheDocument();
  });

  it("defaults a portionless ingredient to a 100 g serving with per-100 g values", () => {
    // yellow onion has food_portions: null → the row falls back to 100 g, so the
    // nutrition shown IS the stored per-100 g figure (identity scaling).
    const onion = ingredientFixtures[4];
    renderTable([onion]);

    expect(screen.getByText("100 g")).toBeInTheDocument();
    // 40 kcal per 100 g, shown unscaled because the serving is 100 g.
    expect(screen.getByText("40")).toBeInTheDocument();
  });

  it("expands to reveal and edit the hidden nutrition fields", async () => {
    vi.mocked(updateIngredient).mockResolvedValueOnce({
      ...cumin,
      updated_at: "2026-07-14T12:00:00.000Z",
    });
    renderTable();

    fireEvent.click(screen.getByLabelText("Details for cumin seed"));

    // Nutrition displays at 2 dp: the fixture's 1.535 saturated fat reads 1.54.
    expect(
      screen.getByLabelText("Saturated fat (g) for cumin seed"),
    ).toHaveValue(1.54);

    const sugars = screen.getByLabelText("Sugars (g) for cumin seed");
    expect(sugars).toBeInTheDocument();
    fireEvent.change(sugars, { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText("Save cumin seed"));

    await waitFor(() => {
      expect(updateIngredient).toHaveBeenCalledWith(
        cumin.id,
        expect.objectContaining({
          nutrition: expect.objectContaining({ sugars_g: 3 }),
        }),
      );
    });
  });

  it("previews a live nutrition label in the drawer with a portion selector", () => {
    renderTable();

    fireEvent.click(screen.getByLabelText("Details for cumin seed"));

    // Scope to the label panel: the drawer also renders bare numbers as
    // inputs, and the same figures appear at other scales in the main row.
    const label = within(screen.getByText("Nutrition Facts").parentElement!);
    // Opens on the 100 g baseline — the big calories number is the stored value.
    expect(label.getByText("375")).toBeInTheDocument();

    // The label tracks the draft, not the saved row: a keystroke in the
    // nutrition grid re-renders it immediately.
    fireEvent.change(screen.getByLabelText("Calories (kcal) for cumin seed"), {
      target: { value: "400" },
    });
    expect(label.getByText("400")).toBeInTheDocument();

    // Switching to the tbsp portion (6 g) rescales: 400 × 0.06 = 24.
    fireEvent.change(
      screen.getByLabelText("Nutrition label portion for cumin seed"),
      { target: { value: "p1" } },
    );
    expect(label.getByText("24")).toBeInTheDocument();
    expect(label.queryByText("400")).not.toBeInTheDocument();
  });

  it("edits portions in the expanded row and sends the whole list on save", async () => {
    vi.mocked(updateIngredient).mockResolvedValueOnce({
      ...cumin,
      updated_at: "2026-07-14T12:00:00.000Z",
    });
    renderTable();

    fireEvent.click(screen.getByLabelText("Details for cumin seed"));

    // Seeded from the USDA food_portions (amount 1 folds away).
    const grams = screen.getByLabelText("cumin seed portion 1 grams");
    expect(grams).toHaveValue("2.1");
    fireEvent.change(grams, { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText("Save cumin seed"));

    await waitFor(() => {
      expect(updateIngredient).toHaveBeenCalledWith(
        cumin.id,
        expect.objectContaining({
          // The list is replaced whole — the untouched second portion rides along.
          food_portions: [
            { modifier: "tsp, whole", gramWeight: 3 },
            { modifier: "tbsp, whole", gramWeight: 6 },
          ],
        }),
      );
    });
  });

  it("deletes only after confirmation and removes the row", async () => {
    vi.mocked(deleteIngredient).mockResolvedValueOnce(undefined);
    renderTable();

    fireEvent.click(screen.getByLabelText("Delete cumin seed"));
    expect(deleteIngredient).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Confirm delete cumin seed"));

    await waitFor(() => {
      expect(deleteIngredient).toHaveBeenCalledWith(cumin.id);
    });
    expect(screen.queryByLabelText("Name for cumin seed")).not.toBeInTheDocument();
  });

  it("opens the create panel, adds a manual ingredient, and prepends it", async () => {
    vi.mocked(createIngredient).mockResolvedValueOnce(
      makeIngredient("new-1", "smoked paprika", { source: "manual" }),
    );
    renderTable();

    // The panel is hidden until the "New ingredient" toggle is clicked.
    expect(screen.queryByLabelText("New ingredient name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New ingredient" }));

    fireEvent.change(screen.getByLabelText("New ingredient name"), {
      target: { value: "smoked paprika" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create ingredient" }));

    await waitFor(() => {
      expect(createIngredient).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "smoked paprika",
          source: "manual",
          aliases: [],
          // Seeded with the default 100 g portion.
          food_portions: [{ gramWeight: 100 }],
        }),
      );
    });
    expect(
      await screen.findByLabelText("Name for smoked paprika"),
    ).toBeInTheDocument();
    // The panel closes on success.
    expect(screen.queryByLabelText("New ingredient name")).not.toBeInTheDocument();
  });

  it("surfaces the duplicate-name error from a failed create", async () => {
    vi.mocked(createIngredient).mockRejectedValueOnce(
      new Error("An ingredient with that name already exists"),
    );
    renderTable();

    fireEvent.click(screen.getByRole("button", { name: "New ingredient" }));
    fireEvent.change(screen.getByLabelText("New ingredient name"), {
      target: { value: "cumin seed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create ingredient" }));

    expect(
      await screen.findByText("An ingredient with that name already exists"),
    ).toBeInTheDocument();
  });

  it("searches server-side on submit", async () => {
    vi.mocked(fetchIngredients).mockResolvedValueOnce({
      data: [ingredientFixtures[1]],
      count: 1,
    });
    renderTable();

    fireEvent.change(screen.getByLabelText("Search ingredients"), {
      target: { value: "flour" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(fetchIngredients).toHaveBeenCalledWith({
        q: "flour",
        page: 1,
        limit: 50,
      });
    });
    expect(screen.queryByLabelText("Name for cumin seed")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name for all-purpose flour")).toBeInTheDocument();
  });

  it("shows a spinner in the Search button while a search is in flight", async () => {
    let resolveFetch: (value: { data: IngredientRow[]; count: number }) => void;
    vi.mocked(fetchIngredients).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderTable();

    const button = screen.getByRole("button", { name: "Search" });
    expect(button).toHaveTextContent("Search");

    fireEvent.click(button);

    // In flight: the label is stable (aria-label) but the text is swapped for
    // the spinner, and the button is disabled.
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).not.toHaveTextContent("Search");

    resolveFetch!({ data: [ingredientFixtures[1]], count: 1 });
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveTextContent("Search");
  });
});
