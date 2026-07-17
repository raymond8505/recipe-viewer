import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import IngredientsTable from "@/components/ingredients/IngredientsTable";
import {
  createIngredient,
  deleteIngredient,
  fetchIngredients,
  updateIngredient,
} from "@/lib/api/ingredients";
import { ingredientFixtures, makeIngredient } from "@/fixtures";

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

  it("adds a manual ingredient and prepends it", async () => {
    vi.mocked(createIngredient).mockResolvedValueOnce(
      makeIngredient("new-1", "smoked paprika", { source: "manual" }),
    );
    renderTable();

    fireEvent.change(screen.getByLabelText("New ingredient name"), {
      target: { value: "smoked paprika" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(createIngredient).toHaveBeenCalledWith({
        name: "smoked paprika",
        source: "manual",
      });
    });
    expect(
      await screen.findByLabelText("Name for smoked paprika"),
    ).toBeInTheDocument();
  });

  it("surfaces the duplicate-name error from a failed add", async () => {
    vi.mocked(createIngredient).mockRejectedValueOnce(
      new Error("An ingredient with that name already exists"),
    );
    renderTable();

    fireEvent.change(screen.getByLabelText("New ingredient name"), {
      target: { value: "cumin seed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

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
});
