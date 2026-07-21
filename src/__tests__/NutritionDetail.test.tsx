import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NutritionDetail from "@/components/ingredients/NutritionDetail";
import {
  normalizeRecipe,
  updateRecipeIngredientAssociation,
} from "@/lib/api/recipes";
import { makeIngredient, makeRecipeIngredient } from "@/fixtures";
import type { IngredientKeywordMatch, RecipeIngredientRow } from "@/types/ingredient";
import type { RecipeIngredient } from "@/types/recipe";

vi.mock("@/lib/api/recipes", () => ({
  normalizeRecipe: vi.fn(),
  updateRecipeIngredientAssociation: vi.fn(),
}));

const search = vi.fn<(q: string) => Promise<IngredientKeywordMatch[]>>();

// Interleaved groups: Cake (indices 0 + 2), Frosting (1), ungrouped (3).
// Grouping reorders these, so passing tests prove position-index alignment.
const schemaIngredients: Array<string | RecipeIngredient> = [
  { name: "100 g butter", group: "Cake" },
  { name: "2 eggs", group: "Frosting" },
  { name: "1 tsp cumin", group: "Cake" },
  "5 g magic dust",
];

const butter = makeIngredient("ing-butter", "butter", {
  nutrition: { calories_kcal: 717, fat_g: 81 },
});
const eggs = makeIngredient("ing-eggs", "egg", {
  nutrition: { calories_kcal: 143 },
});
const cumin = makeIngredient("ing-cumin", "cumin seed", {
  nutrition: { calories_kcal: 375 },
  density_g_per_ml: 0.42,
});

function makeRows(): RecipeIngredientRow[] {
  return [
    makeRecipeIngredient("r-1", 0, {
      id: "ri-0",
      raw_text: "100 g butter",
      quantity: 100,
      unit: "g",
      ingredient_id: "ing-butter",
      match_status: "matched",
    }),
    makeRecipeIngredient("r-1", 1, {
      id: "ri-1",
      raw_text: "2 eggs",
      quantity: 2,
      unit: null,
      ingredient_id: "ing-eggs",
      match_status: "matched",
    }),
    makeRecipeIngredient("r-1", 2, {
      id: "ri-2",
      raw_text: "1 tsp cumin",
      quantity: 1,
      unit: "tsp",
      ingredient_id: "ing-cumin",
      match_status: "matched",
    }),
    makeRecipeIngredient("r-1", 3, {
      id: "ri-3",
      raw_text: "5 g magic dust",
      quantity: 5,
      unit: "g",
      ingredient_id: null,
      match_status: "unmatched",
    }),
  ];
}

function renderDetail(overrides?: {
  rows?: RecipeIngredientRow[];
  recipeYield?: string | undefined;
}) {
  return render(
    <NutritionDetail
      recipeId="r-1"
      schemaIngredients={schemaIngredients}
      recipeYield={overrides && "recipeYield" in overrides ? overrides.recipeYield : "4 servings"}
      initialRows={overrides?.rows ?? makeRows()}
      initialIngredients={[butter, eggs, cumin]}
      search={search}
    />,
  );
}

function rowFor(text: string): HTMLElement {
  const cell = screen.getByText(text);
  const row = cell.closest("tr");
  if (!row) throw new Error(`No table row contains "${text}"`);
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
  search.mockResolvedValue([]);
});

describe("NutritionDetail", () => {
  it("groups lines under recipe headings despite interleaving", () => {
    renderDetail();

    const rows = screen.getAllByRole("row").map((r) => r.textContent ?? "");
    const cakeIdx = rows.findIndex((t) => t === "Cake");
    const frostingIdx = rows.findIndex((t) => t === "Frosting");
    const butterIdx = rows.findIndex((t) => t.includes("100 g butter"));
    const cuminIdx = rows.findIndex((t) => t.includes("1 tsp cumin"));
    const eggsIdx = rows.findIndex((t) => t.includes("2 eggs"));

    // Both Cake lines sit between the Cake and Frosting headings.
    expect(cakeIdx).toBeGreaterThan(-1);
    expect(butterIdx).toBeGreaterThan(cakeIdx);
    expect(cuminIdx).toBeGreaterThan(cakeIdx);
    expect(frostingIdx).toBeGreaterThan(cuminIdx);
    expect(eggsIdx).toBeGreaterThan(frostingIdx);
  });

  it("computes line contributions from grams conversion (weight and volume)", () => {
    renderDetail();

    // 100 g butter → 717 kcal, 81 g fat.
    expect(rowFor("100 g butter")).toHaveTextContent("717");
    // 1 tsp cumin → 4.92892 ml × 0.42 g/ml = 2.07 g → ×375/100 = 7.76 kcal.
    expect(rowFor("1 tsp cumin")).toHaveTextContent("7.76");
  });

  it("orders nutrition headers panel-first with full titles", () => {
    renderDetail();

    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent ?? "");
    expect(headers).toEqual([
      "Ingredient",
      "Normalized",
      // The NutritionPanel six, in its display order…
      "Calories (kcal)",
      "Protein (g)",
      "Carbohydrate (g)",
      "Total fat (g)",
      "Dietary fiber (g)",
      "Sodium (mg)",
      // …then the rest. No computed-grams column.
      "Saturated fat (g)",
      "Sugars (g)",
      "Cholesterol (mg)",
      "Calcium (mg)",
      "Iron (mg)",
      "Potassium (mg)",
    ]);
  });

  it("flags excluded lines with the reason and em-dash cells", () => {
    renderDetail();

    // "2 eggs" is matched but unitless — can't convert to grams.
    const eggsRow = rowFor("2 eggs");
    expect(
      within(eggsRow).getByTitle("No unit (count line) — can't convert to grams"),
    ).toBeInTheDocument();
    expect(within(eggsRow).getAllByText("—").length).toBeGreaterThan(0);

    // "5 g magic dust" has no catalog match.
    expect(
      within(rowFor("5 g magic dust")).getByTitle(
        "Not matched to the catalog — pick an ingredient to include it",
      ),
    ).toBeInTheDocument();

    expect(screen.getByText(/Totals exclude 2 flagged lines/)).toBeInTheDocument();
  });

  it("sums totals over convertible lines and divides per portion by servings", () => {
    renderDetail();

    // 717 (butter) + 7.7630 (cumin) = 724.76 kcal.
    expect(rowFor("Recipe total")).toHaveTextContent("724.76");

    const perPortion = rowFor("Per portion (÷4)");
    expect(perPortion).toHaveTextContent("181.19");
  });

  it("renders a dashed per-portion row when servings are unknown", () => {
    renderDetail({ recipeYield: undefined });

    const perPortion = rowFor("Per portion");
    expect(
      within(perPortion).queryByText(/181/),
    ).not.toBeInTheDocument();
    expect(perPortion).toHaveTextContent("—");
  });

  it("marks edited lines stale, excludes them, and offers re-normalization", async () => {
    const user = userEvent.setup();
    const rows = makeRows();
    rows[0] = { ...rows[0], raw_text: "200 g butter, softened" };
    vi.mocked(normalizeRecipe).mockResolvedValue(undefined);
    renderDetail({ rows });

    const butterRow = rowFor("100 g butter");
    expect(
      within(butterRow).getByTitle(
        "Line changed since normalization — re-run normalization",
      ),
    ).toBeInTheDocument();
    // The stale line's contribution is out of the totals.
    expect(rowFor("Recipe total")).toHaveTextContent("7.76");
    expect(rowFor("Recipe total")).not.toHaveTextContent("724.76");

    await user.click(screen.getByRole("button", { name: "Re-run normalization" }));
    expect(normalizeRecipe).toHaveBeenCalledWith("r-1");
    // A 200 means queued, not done — the button flips to a refresh affordance.
    expect(
      await screen.findByRole("button", { name: "Queued — check again" }),
    ).toBeInTheDocument();
  });

  it("persists an association change and recomputes the row and totals", async () => {
    const user = userEvent.setup();
    const magicMatch: IngredientKeywordMatch = {
      id: "ing-magic",
      name: "magic dust",
      aliases: [],
      nutrition: { calories_kcal: 100 },
      density_g_per_ml: 1,
      similarity: 0.95,
    };
    search.mockResolvedValue([magicMatch]);
    vi.mocked(updateRecipeIngredientAssociation).mockResolvedValue(
      makeRecipeIngredient("r-1", 3, {
        id: "ri-3",
        raw_text: "5 g magic dust",
        quantity: 5,
        unit: "g",
        ingredient_id: "ing-magic",
        match_status: "manual",
      }),
    );
    renderDetail();

    await user.click(screen.getByLabelText("Change match for 5 g magic dust"));
    await user.type(screen.getByRole("combobox"), "magic");
    await user.click(await screen.findByRole("option", { name: /magic dust/ }));

    expect(updateRecipeIngredientAssociation).toHaveBeenCalledWith(
      "r-1",
      "ri-3",
      "ing-magic",
    );
    // 5 g × 100 kcal/100g = 5 kcal joins the totals: 724.76 + 5 = 729.76.
    await waitFor(() => expect(rowFor("Recipe total")).toHaveTextContent("729.76"));
    expect(screen.getByText("magic dust")).toBeInTheDocument();
    expect(screen.getByText(/Totals exclude 1 flagged line/)).toBeInTheDocument();
  });
});
