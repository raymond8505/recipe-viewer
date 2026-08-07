import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NutritionDetail from "@/components/ingredients/NutritionDetail";
import {
  estimateIngredientGrams,
  normalizeRecipe,
  setIngredientGrams,
  updateRecipeIngredientAssociation,
  updateRecipeIngredientLine,
} from "@/lib/api/recipes";
import { importUsdaIngredient } from "@/lib/api/ingredients";
import { makeIngredient, makeRecipeIngredient } from "@/fixtures";
import type {
  IngredientKeywordMatch,
  RecipeIngredientRow,
} from "@/types/ingredient";
import type { UsdaSearchFood } from "@/lib/usda";
import type { RecipeIngredient } from "@/types/recipe";

vi.mock("@/lib/api/recipes", () => ({
  normalizeRecipe: vi.fn(),
  updateRecipeIngredientAssociation: vi.fn(),
  updateRecipeIngredientLine: vi.fn(),
  estimateIngredientGrams: vi.fn(),
  setIngredientGrams: vi.fn(),
}));

vi.mock("@/lib/api/ingredients", () => ({
  importUsdaIngredient: vi.fn(),
  searchIngredientsKeyword: vi.fn(),
  searchUsdaFoods: vi.fn(),
}));

const search = vi.fn<(q: string) => Promise<IngredientKeywordMatch[]>>();
const usdaSearch = vi.fn<(q: string) => Promise<UsdaSearchFood[]>>();

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
      name_text: "magic dust",
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
      recipeYield={
        overrides && "recipeYield" in overrides
          ? overrides.recipeYield
          : "4 servings"
      }
      initialRows={overrides?.rows ?? makeRows()}
      initialIngredients={[butter, eggs, cumin]}
      search={search}
      usdaSearch={usdaSearch}
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
  usdaSearch.mockResolvedValue([]);
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
      "Carbs (g)",
      "Fat (g)",
      "Fiber (g)",
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
      within(eggsRow).getByTitle(
        "No unit (count line) — can't convert to grams",
      ),
    ).toBeInTheDocument();
    expect(within(eggsRow).getAllByText("—").length).toBeGreaterThan(0);

    // "5 g magic dust" has no catalog match.
    expect(
      within(rowFor("5 g magic dust")).getByTitle(
        "Not matched to the catalog — pick an ingredient to include it",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Totals exclude 2 flagged lines/),
    ).toBeInTheDocument();
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
    expect(within(perPortion).queryByText(/181/)).not.toBeInTheDocument();
    expect(perPortion).toHaveTextContent("—");
  });

  it("always offers a Normalize button, flipping to a refresh affordance once queued", async () => {
    const user = userEvent.setup();
    vi.mocked(normalizeRecipe).mockResolvedValue(undefined);
    renderDetail();

    // Present even with nothing stale — it exists to fill in unmatched lines.
    await user.click(screen.getByRole("button", { name: "Normalize" }));
    expect(normalizeRecipe).toHaveBeenCalledWith("r-1");
    // A 200 means queued, not done — the button flips to a refresh affordance.
    expect(
      await screen.findByRole("button", { name: "Queued — check again" }),
    ).toBeInTheDocument();
  });

  it("marks edited lines stale and excludes them from totals", () => {
    const rows = makeRows();
    rows[0] = { ...rows[0], raw_text: "200 g butter, softened" };
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
    expect(
      screen.getByText(/changed since the last normalization run/),
    ).toBeInTheDocument();
  });

  // Regression: after an inline text edit the row's raw_text still holds the
  // OLD text, so the line reads stale — and the association PATCH only moves
  // ingredient_id, never raw_text. A manual re-match therefore stayed stale,
  // and the hook was nulling the catalog lookup for stale lines, so the picked
  // ingredient rendered as "(unknown ingredient)" until a refresh pulled
  // re-normalized rows. Staleness governs TOTALS (lineComputationForSchema
  // decides that itself), never whether we know which row is associated.
  it("shows the picked ingredient's name on a stale line, not '(unknown ingredient)'", async () => {
    const user = userEvent.setup();
    const rows = makeRows();
    // Edited since normalization, and unmatched — the state the repro lands in.
    rows[0] = {
      ...rows[0],
      raw_text: "200 g butter, softened",
      ingredient_id: null,
      match_status: "unmatched",
    };
    // USDA-style canonical name: distinct from the typed query, so the option
    // regex can't also match the pinned `Search USDA for "butter"` action.
    const butterMatch: IngredientKeywordMatch = {
      id: "ing-butter",
      name: "Butter, without salt",
      aliases: ["butter"],
      nutrition: { calories_kcal: 717, fat_g: 81 },
      density_g_per_ml: null,
      similarity: 0.98,
    };
    search.mockResolvedValue([butterMatch]);
    // The PATCH returns the row with the new association — raw_text unchanged,
    // so the line is still stale afterwards.
    vi.mocked(updateRecipeIngredientAssociation).mockResolvedValue({
      ...rows[0],
      ingredient_id: "ing-butter",
      match_status: "manual",
    });
    renderDetail({ rows });

    await user.click(screen.getByLabelText("Change match for 100 g butter"));
    await user.type(screen.getByRole("combobox"), "butter");
    await user.click(
      await screen.findByRole("option", { name: /Butter, without salt/ }),
    );

    await waitFor(() =>
      expect(updateRecipeIngredientAssociation).toHaveBeenCalledWith(
        "r-1",
        "ri-0",
        "ing-butter",
      ),
    );
    await waitFor(() =>
      expect(
        within(rowFor("100 g butter")).getByText("Butter, without salt"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("(unknown ingredient)")).not.toBeInTheDocument();

    // The line is still stale, so it must stay out of the totals — the fix is
    // about what we display, not about what counts.
    expect(
      within(rowFor("100 g butter")).getByTitle(
        "Line changed since normalization — re-run normalization",
      ),
    ).toBeInTheDocument();
    expect(rowFor("Recipe total")).not.toHaveTextContent("724.76");
  });

  it("saves an edited line text, marks it stale, and flips Normalize to queued", async () => {
    const user = userEvent.setup();
    const updatedLines: Array<string | RecipeIngredient> = [
      ...schemaIngredients.slice(0, 3),
      "6 g magic dust",
    ];
    vi.mocked(updateRecipeIngredientLine).mockResolvedValue(updatedLines);
    renderDetail();

    await user.click(screen.getByLabelText("Edit 5 g magic dust"));
    const field = screen.getByLabelText("Edit line 5 g magic dust");
    await user.clear(field);
    await user.type(field, "6 g magic dust{Enter}");

    // Index 3 is the line's schema position, not a row id — a stale line may
    // have no row at all.
    expect(updateRecipeIngredientLine).toHaveBeenCalledWith("r-1", 3, "6 g magic dust");
    const editedRow = await screen.findByText("6 g magic dust");
    // The stored row still says "5 g magic dust", so the edited line reads
    // stale until the auto-queued re-normalization rebuilds it…
    expect(
      within(rowFor("6 g magic dust")).getByTitle(
        "Line changed since normalization — re-run normalization",
      ),
    ).toBeInTheDocument();
    expect(editedRow).toBeInTheDocument();
    // …and the Normalize button reflects that a run is already queued.
    expect(
      screen.getByRole("button", { name: "Queued — check again" }),
    ).toBeInTheDocument();
  });

  it("cancels an edit on Escape without saving", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByLabelText("Edit 5 g magic dust"));
    const field = screen.getByLabelText("Edit line 5 g magic dust");
    await user.clear(field);
    await user.type(field, "something else");
    await user.keyboard("{Escape}");

    expect(updateRecipeIngredientLine).not.toHaveBeenCalled();
    expect(screen.getByText("5 g magic dust")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Edit line 5 g magic dust"),
    ).not.toBeInTheDocument();
  });

  it("treats an empty or unchanged commit as a cancel", async () => {
    const user = userEvent.setup();
    renderDetail();

    // Unchanged text → no save.
    await user.click(screen.getByLabelText("Edit 5 g magic dust"));
    await user.type(
      screen.getByLabelText("Edit line 5 g magic dust"),
      "{Enter}",
    );
    expect(updateRecipeIngredientLine).not.toHaveBeenCalled();

    // Blanked-out text → no save either.
    await user.click(screen.getByLabelText("Edit 5 g magic dust"));
    const field = screen.getByLabelText("Edit line 5 g magic dust");
    await user.clear(field);
    await user.type(field, "{Enter}");
    expect(updateRecipeIngredientLine).not.toHaveBeenCalled();
    expect(screen.getByText("5 g magic dust")).toBeInTheDocument();
  });

  it("surfaces a line-save failure in the error banner", async () => {
    const user = userEvent.setup();
    vi.mocked(updateRecipeIngredientLine).mockRejectedValue(
      new Error("Ingredient line update failed with status 500"),
    );
    renderDetail();

    await user.click(screen.getByLabelText("Edit 5 g magic dust"));
    const field = screen.getByLabelText("Edit line 5 g magic dust");
    await user.clear(field);
    await user.type(field, "6 g magic dust{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ingredient line update failed with status 500",
    );
    // The line keeps its stored text — the save never landed.
    expect(screen.getByText("5 g magic dust")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Queued — check again" }),
    ).not.toBeInTheDocument();
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
    await waitFor(() =>
      expect(rowFor("Recipe total")).toHaveTextContent("729.76"),
    );
    expect(screen.getByText("magic dust")).toBeInTheDocument();
    expect(
      screen.getByText(/Totals exclude 1 flagged line/),
    ).toBeInTheDocument();
  });

  it("imports a USDA food for a line the catalog can't match and recomputes", async () => {
    const user = userEvent.setup();
    const gochujang: UsdaSearchFood = {
      fdcId: 123,
      description: "MAGIC DUST SEASONING",
      dataType: "Branded",
    };
    usdaSearch.mockResolvedValue([gochujang]);
    vi.mocked(importUsdaIngredient).mockResolvedValue(
      makeIngredient("ing-magic", "magic dust", {
        nutrition: { calories_kcal: 100 },
        density_g_per_ml: 1,
        fdc_data_type: "Branded",
      }),
    );
    vi.mocked(updateRecipeIngredientAssociation).mockResolvedValue(
      makeRecipeIngredient("r-1", 3, {
        id: "ri-3",
        raw_text: "5 g magic dust",
        quantity: 5,
        unit: "g",
        name_text: "magic dust",
        ingredient_id: "ing-magic",
        match_status: "manual",
      }),
    );
    renderDetail();

    await user.click(screen.getByLabelText("Change match for 5 g magic dust"));
    await user.type(screen.getByRole("combobox"), "magic dust");
    await user.click(
      await screen.findByRole("option", { name: /Search USDA for/ }),
    );
    await user.click(
      await screen.findByRole("option", { name: /MAGIC DUST SEASONING/ }),
    );

    // Canonical name = the line's parsed name, not USDA's description.
    expect(importUsdaIngredient).toHaveBeenCalledWith(123, "magic dust");
    expect(updateRecipeIngredientAssociation).toHaveBeenCalledWith(
      "r-1",
      "ri-3",
      "ing-magic",
    );
    // The imported nutrition joins the totals: 724.76 + 5 = 729.76.
    await waitFor(() =>
      expect(rowFor("Recipe total")).toHaveTextContent("729.76"),
    );
    expect(screen.getByText("magic dust")).toBeInTheDocument();
  });

  it("estimates grams for a grams-less matched line and folds it into totals", async () => {
    const user = userEvent.setup();
    // "2 eggs" is matched but count-based (no unit, no density) → excluded until
    // it gets an estimate.
    vi.mocked(estimateIngredientGrams).mockResolvedValue(
      makeRecipeIngredient("r-1", 1, {
        id: "ri-1",
        raw_text: "2 eggs",
        quantity: 2,
        unit: null,
        ingredient_id: "ing-eggs",
        match_status: "matched",
        estimated_grams: 100,
        grams_source: "llm",
      }),
    );
    renderDetail();

    const eggsRow = rowFor("2 eggs");
    // Starts excluded — no grams path.
    expect(
      within(eggsRow).getByTitle(
        "No unit (count line) — can't convert to grams",
      ),
    ).toBeInTheDocument();

    await user.click(
      within(eggsRow).getByRole("button", {
        name: "Estimate grams for 2 eggs",
      }),
    );

    expect(estimateIngredientGrams).toHaveBeenCalledWith("r-1", "ri-1");
    // 100 g × 143 kcal/100g = 143 kcal joins the totals: 724.76 + 143 = 867.76.
    await waitFor(() =>
      expect(rowFor("Recipe total")).toHaveTextContent("867.76"),
    );
    // The estimate is marked and the stored value fills the field.
    expect(within(rowFor("2 eggs")).getByText("est.")).toBeInTheDocument();
    expect(
      within(rowFor("2 eggs")).getByLabelText("Grams for 2 eggs"),
    ).toHaveValue(100);
  });

  it("persists a user-typed gram value on blur", async () => {
    const user = userEvent.setup();
    vi.mocked(setIngredientGrams).mockResolvedValue(
      makeRecipeIngredient("r-1", 1, {
        id: "ri-1",
        raw_text: "2 eggs",
        quantity: 2,
        unit: null,
        ingredient_id: "ing-eggs",
        match_status: "matched",
        estimated_grams: 110,
        grams_source: "manual",
      }),
    );
    renderDetail();

    const input = within(rowFor("2 eggs")).getByLabelText("Grams for 2 eggs");
    await user.type(input, "110");
    await user.tab(); // blur commits

    expect(setIngredientGrams).toHaveBeenCalledWith("r-1", "ri-1", 110);
    // 110 g × 143 kcal/100g = 157.3 joins the totals: 724.76 + 157.3 = 882.06.
    await waitFor(() =>
      expect(rowFor("Recipe total")).toHaveTextContent("882.06"),
    );
  });
});
