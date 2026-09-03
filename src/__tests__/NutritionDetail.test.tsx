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
import { clickAndConfirm } from "./helpers/confirmBar";
import type {
  IngredientKeywordMatch,
  IngredientRow,
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
// Grouping reorders these, so passing tests prove index alignment. Every line
// carries a stable id — the shape every persisted recipe has had since
// db/migrations/0013; the legacy fixtures below opt out on purpose.
const schemaIngredients: Array<string | RecipeIngredient> = [
  { name: "100 g butter", group: "Cake", id: "L0" },
  { name: "2 eggs", group: "Frosting", id: "L1" },
  { name: "1 tsp cumin", group: "Cake", id: "L2" },
  { name: "5 g magic dust", id: "L3" },
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
      line_id: "L0",
      raw_text: "100 g butter",
      quantity: 100,
      unit: "g",
      ingredient_id: "ing-butter",
      match_status: "matched",
    }),
    makeRecipeIngredient("r-1", 1, {
      id: "ri-1",
      line_id: "L1",
      raw_text: "2 eggs",
      quantity: 2,
      unit: null,
      ingredient_id: "ing-eggs",
      match_status: "matched",
    }),
    makeRecipeIngredient("r-1", 2, {
      id: "ri-2",
      line_id: "L2",
      raw_text: "1 tsp cumin",
      quantity: 1,
      unit: "tsp",
      ingredient_id: "ing-cumin",
      match_status: "matched",
    }),
    makeRecipeIngredient("r-1", 3, {
      id: "ri-3",
      line_id: "L3",
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
  schemaIngredients?: Array<string | RecipeIngredient>;
  recipeYield?: string | undefined;
  initialIngredients?: IngredientRow[];
}) {
  return render(
    <NutritionDetail
      recipeId="r-1"
      schemaIngredients={overrides?.schemaIngredients ?? schemaIngredients}
      recipeYield={
        overrides && "recipeYield" in overrides
          ? overrides.recipeYield
          : "4 servings"
      }
      initialRows={overrides?.rows ?? makeRows()}
      initialIngredients={overrides?.initialIngredients ?? [butter, eggs, cumin]}
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

    // "2 eggs" is matched but unitless — can't convert to grams. Matched by
    // prefix: the tooltip also carries the fixes ("…or enter 0 to count this
    // line as nothing"), which the copy test below asserts on its own.
    const eggsRow = rowFor("2 eggs");
    expect(
      within(eggsRow).getByTitle(
        /^No unit \(count line\) — can't convert to grams\./,
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
    await clickAndConfirm("Normalize");
    expect(normalizeRecipe).toHaveBeenCalledWith("r-1");
    // A 200 means queued, not done — the button flips to a refresh affordance.
    expect(
      await screen.findByRole("button", { name: "Queued — check again" }),
    ).toBeInTheDocument();
  });

  // Normalization queues a LangGraph run — model parsing plus USDA lookups for
  // every line — and the route returns before it happens, so there is nothing
  // to undo. The up-front confirm is the only guard, which makes "a misclick
  // spends nothing" the contract worth pinning down.
  it("does not queue a normalization run until the confirm is accepted", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("button", { name: "Normalize" }));

    expect(
      screen.getByText(/re-parses every ingredient line/i),
    ).toBeInTheDocument();
    expect(normalizeRecipe).not.toHaveBeenCalled();
  });

  it("restores the Normalize button on cancel without queueing anything", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("button", { name: "Normalize" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText(/re-parses every ingredient line/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Normalize" })).toBeInTheDocument();
    expect(normalizeRecipe).not.toHaveBeenCalled();
  });

  // The queued-state affordance is a local router.refresh(), not a re-run — it
  // costs nothing and so must NOT inherit the confirm.
  it("leaves the queued refresh affordance ungated", async () => {
    const user = userEvent.setup();
    vi.mocked(normalizeRecipe).mockResolvedValue(undefined);
    renderDetail();

    await clickAndConfirm("Normalize");

    await user.click(
      await screen.findByRole("button", { name: "Queued — check again" }),
    );

    // No confirm was raised, and nothing was queued a second time.
    expect(
      screen.queryByText(/re-parses every ingredient line/i),
    ).not.toBeInTheDocument();
    expect(normalizeRecipe).toHaveBeenCalledTimes(1);
  });

  // The line text is display copy; the line id is the identity. Someone
  // dropping a brand name from "100 g Acme brand butter" has said nothing
  // about which food the line is, so the association it was curated onto —
  // and its share of the totals — must survive untouched.
  it("keeps a reworded line matched and counted", () => {
    const rows = makeRows();
    rows[0] = { ...rows[0], raw_text: "100 g Acme brand butter" };
    renderDetail({ rows });

    const butterRow = rowFor("100 g butter");
    expect(
      within(butterRow).queryByTitle(
        "No normalized row for this line — run normalization",
      ),
    ).not.toBeInTheDocument();
    expect(butterRow).toHaveTextContent("717");
    expect(rowFor("Recipe total")).toHaveTextContent("724.76");
    expect(
      screen.queryByText(/have never been normalized/),
    ).not.toBeInTheDocument();
  });

  it("flags a line with no normalized row and excludes it from totals", () => {
    // Every row but butter's — the state a line lands in before its first
    // normalization run.
    renderDetail({ rows: makeRows().slice(1) });

    expect(
      within(rowFor("100 g butter")).getByTitle(
        "No normalized row for this line — run normalization",
      ),
    ).toBeInTheDocument();
    expect(rowFor("Recipe total")).toHaveTextContent("7.76");
    expect(rowFor("Recipe total")).not.toHaveTextContent("724.76");
    expect(
      screen.getByText(/have never been normalized/),
    ).toBeInTheDocument();
  });

  // Legacy: rows written before line ids can only be found by position, so
  // there the text IS the only evidence the row belongs to this line.
  it("still flags a position-joined legacy row whose text has moved on", () => {
    const rows = makeRows().map((row) => ({ ...row, line_id: null }));
    rows[0] = { ...rows[0], raw_text: "200 g butter, softened" };
    renderDetail({
      rows,
      schemaIngredients: schemaIngredients.map((line) =>
        typeof line === "string" ? line : { name: line.name, group: line.group },
      ),
    });

    expect(
      within(rowFor("100 g butter")).getByTitle(
        "No normalized row for this line — run normalization",
      ),
    ).toBeInTheDocument();
    expect(rowFor("Recipe total")).not.toHaveTextContent("724.76");
  });

  // Regression: the association PATCH only moves ingredient_id, never
  // raw_text, so on a stale line the picked ingredient stayed "(unknown
  // ingredient)" — the hook was nulling the catalog lookup for stale lines and
  // nothing short of a reload could clear it. Staleness governs TOTALS
  // (lineComputationForSchema decides that itself), never whether we know
  // which row is associated. Legacy-shaped, since that is where a line can
  // still be both stale and have a row.
  it("shows the picked ingredient's name on a stale line, not '(unknown ingredient)'", async () => {
    const user = userEvent.setup();
    const legacyLines = schemaIngredients.map((line) =>
      typeof line === "string" ? line : { name: line.name, group: line.group },
    );
    const rows = makeRows().map((row) => ({ ...row, line_id: null }));
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
    renderDetail({ rows, schemaIngredients: legacyLines });

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
        "No normalized row for this line — run normalization",
      ),
    ).toBeInTheDocument();
    expect(rowFor("Recipe total")).not.toHaveTextContent("724.76");
  });

  // Rewording is not a re-match request. The server re-parses the derived rows
  // in-band and hands them back, so the edited line keeps its ingredient and
  // its contribution — and nothing here may imply a matcher run was queued.
  it("saves an edited line text and keeps it matched and counted", async () => {
    const user = userEvent.setup();
    const syncedRows = makeRows();
    syncedRows[2] = { ...syncedRows[2], raw_text: "1 tsp cumin, toasted" };
    vi.mocked(updateRecipeIngredientLine).mockResolvedValue({
      recipeIngredient: [
        ...schemaIngredients.slice(0, 2),
        { name: "1 tsp cumin, toasted", id: "L2" },
        schemaIngredients[3],
      ],
      rows: syncedRows,
    });
    renderDetail();

    await user.click(screen.getByLabelText("Edit 1 tsp cumin"));
    const field = screen.getByLabelText("Edit line 1 tsp cumin");
    await user.clear(field);
    await user.type(field, "1 tsp cumin, toasted{Enter}");

    // Index 2 is the line's schema position, not a row id — a line with no row
    // yet still has to be addressable.
    expect(updateRecipeIngredientLine).toHaveBeenCalledWith(
      "r-1",
      2,
      "1 tsp cumin, toasted",
    );
    await screen.findByText("1 tsp cumin, toasted");
    const editedRow = rowFor("1 tsp cumin, toasted");
    expect(
      within(editedRow).queryByTitle(
        "No normalized row for this line — run normalization",
      ),
    ).not.toBeInTheDocument();
    expect(editedRow).toHaveTextContent("7.76");
    expect(rowFor("Recipe total")).toHaveTextContent("724.76");
    // No run was queued, so the button must not claim one was.
    expect(
      screen.queryByRole("button", { name: "Queued — check again" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Normalize" }),
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

  // The breakdown is where a bad catalog row shows itself, so every matched
  // line links to that row in the ingredient manager with the search pre-filled
  // — the manager owns the editing UI, this table just points at it.
  it("links a matched line to the ingredient manager, search pre-filled", () => {
    renderDetail();

    const link = within(rowFor("1 tsp cumin")).getByRole("link", {
      name: "Edit cumin seed in the ingredient manager",
    });
    expect(link).toHaveAttribute("href", "/ingredients?q=cumin%20seed");
    // New tab: this page's include-toggle lens is session state worth keeping.
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("offers no manager link on an unmatched line", () => {
    renderDetail();

    expect(
      within(rowFor("5 g magic dust")).queryByRole("link"),
    ).not.toBeInTheDocument();
  });

  // An id we can't resolve to a catalog row leaves us with no name to search
  // the manager with, so a link would land on an empty list.
  it("offers no manager link when the matched id resolves to nothing", () => {
    renderDetail({ initialIngredients: [eggs, cumin] });

    const row = rowFor("100 g butter");
    expect(within(row).getByText("(unknown ingredient)")).toBeInTheDocument();
    expect(within(row).queryByRole("link")).not.toBeInTheDocument();
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
        line_id: "L3",
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
        line_id: "L3",
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
        line_id: "L1",
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
        /^No unit \(count line\) — can't convert to grams\./,
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

  it("drops a switched-off line from the recipe total and per-portion rows", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("checkbox", { name: "Include 100 g butter" }));

    // Only cumin still contributes: 724.76 − 717 = 7.76, ÷4 = 1.94.
    expect(rowFor("Recipe total")).toHaveTextContent("7.76");
    expect(rowFor("Recipe total")).not.toHaveTextContent("724.76");
    expect(rowFor("Per portion (÷4)")).toHaveTextContent("1.94");
  });

  it("fades and strikes through a switched-off line instead of hiding it", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("checkbox", { name: "Include 100 g butter" }));

    // The numbers stay on screen — seeing what you removed is the point.
    const butterRow = rowFor("100 g butter");
    expect(butterRow).toHaveTextContent("717");
    expect(screen.getByText("100 g butter")).toHaveClass("line-through");
  });

  it("switches a whole group off in one action, leaving other groups alone", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(
      screen.getByRole("checkbox", { name: "Include all Cake ingredients" }),
    );

    // Cake holds both contributing lines (butter + cumin), so nothing is left
    // to total; "2 eggs" (Frosting) never contributed and stays switched on.
    expect(rowFor("Recipe total")).not.toHaveTextContent("724.76");
    expect(rowFor("Recipe total")).not.toHaveTextContent("7.76");
    expect(
      screen.getByRole("checkbox", { name: "Include 100 g butter" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("checkbox", { name: "Include 1 tsp cumin" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("checkbox", { name: "Include 2 eggs" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("shows a group toggle as mixed when only some of its lines are on", async () => {
    const user = userEvent.setup();
    renderDetail();

    const cakeToggle = screen.getByRole("checkbox", {
      name: "Include all Cake ingredients",
    });
    await user.click(cakeToggle);
    expect(cakeToggle).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("checkbox", { name: "Include 100 g butter" }));
    expect(cakeToggle).toHaveAttribute("aria-checked", "mixed");

    // Clicking a mixed group completes it rather than clearing it.
    await user.click(cakeToggle);
    expect(cakeToggle).toHaveAttribute("aria-checked", "true");
    expect(rowFor("Recipe total")).toHaveTextContent("724.76");
  });

  it("keeps switched-off lines out of the flagged-line count", async () => {
    const user = userEvent.setup();
    renderDetail();

    // Baseline: "2 eggs" (no unit) and "5 g magic dust" (unmatched).
    expect(screen.getByText(/Totals exclude 2 flagged lines/)).toBeInTheDocument();

    // Switching off a healthy line must not turn it into a flagged one.
    await user.click(screen.getByRole("checkbox", { name: "Include 100 g butter" }));
    expect(screen.getByText(/Totals exclude 2 flagged lines/)).toBeInTheDocument();

    // Switching off an already-flagged line drops it from the count — it is no
    // longer silently missing from the tally.
    await user.click(screen.getByRole("checkbox", { name: "Include 2 eggs" }));
    expect(screen.getByText(/Totals exclude 1 flagged line/)).toBeInTheDocument();
  });

  it("offers 'Enable all' only while something is off, and restores the total", async () => {
    const user = userEvent.setup();
    renderDetail();

    expect(
      screen.queryByRole("button", { name: "Enable all" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Include 100 g butter" }));
    await user.click(screen.getByRole("checkbox", { name: "Include 2 eggs" }));
    expect(
      screen.getByText(/2 ingredients switched off/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enable all" }));

    expect(rowFor("Recipe total")).toHaveTextContent("724.76");
    expect(
      screen.queryByRole("button", { name: "Enable all" }),
    ).not.toBeInTheDocument();
  });

  it("persists a user-typed gram value on blur", async () => {
    const user = userEvent.setup();
    vi.mocked(setIngredientGrams).mockResolvedValue(
      makeRecipeIngredient("r-1", 1, {
        id: "ri-1",
        line_id: "L1",
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

  // A typed 0 is the escape hatch for a line nobody can weigh: it persists as a
  // value (not a clear), stops the line being flagged, and adds nothing.
  it("accepts a typed 0 and stops flagging the line without changing totals", async () => {
    const user = userEvent.setup();
    vi.mocked(setIngredientGrams).mockResolvedValue(
      makeRecipeIngredient("r-1", 1, {
        id: "ri-1",
        line_id: "L1",
        raw_text: "2 eggs",
        quantity: 2,
        unit: null,
        ingredient_id: "ing-eggs",
        match_status: "matched",
        estimated_grams: 0,
        grams_source: "manual",
      }),
    );
    renderDetail();

    // Two lines start flagged: "2 eggs" (no unit) and "5 g magic dust"
    // (unmatched, and NOT something 0 can fix).
    expect(screen.getByText(/exclude 2 flagged lines/)).toBeInTheDocument();

    const input = within(rowFor("2 eggs")).getByLabelText("Grams for 2 eggs");
    await user.type(input, "0");
    await user.tab(); // blur commits

    expect(setIngredientGrams).toHaveBeenCalledWith("r-1", "ri-1", 0);
    await waitFor(() =>
      expect(screen.getByText(/exclude 1 flagged line/)).toBeInTheDocument(),
    );

    const eggsRow = rowFor("2 eggs");
    // Marked as a decision, not a guess — and the warning flag is gone.
    expect(within(eggsRow).getByText("not counted")).toBeInTheDocument();
    expect(within(eggsRow).queryByText("est.")).not.toBeInTheDocument();
    expect(
      within(eggsRow).queryByTitle(/can't convert to grams/),
    ).not.toBeInTheDocument();
    // The line now contributes an explicit 0 rather than an em dash.
    expect(within(eggsRow).getByText("0")).toBeInTheDocument();
    // Butter (717) + cumin (7.76) — unchanged, because 0 g of egg is 0 kcal.
    expect(rowFor("Recipe total")).toHaveTextContent("724.76");
  });

  it("rejects a negative gram entry back to the stored value", async () => {
    const user = userEvent.setup();
    renderDetail();

    const input = within(rowFor("2 eggs")).getByLabelText("Grams for 2 eggs");
    await user.type(input, "-5");
    await user.tab();

    expect(setIngredientGrams).not.toHaveBeenCalled();
    expect(input).toHaveValue(null);
  });
});
