// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runNormalization } from "@/lib/normalization/graph";
import { ingredientFingerprint } from "@/lib/normalization/fingerprint";
import { generateStructured } from "@/lib/gemini";
import { generateEmbedding } from "@/lib/embedding";
import {
  IngredientRepoError,
  createIngredientRow,
  getIngredientByFdcId,
  getIngredientsByIds,
  getRecipeIngredients,
  matchIngredients,
  replaceRecipeIngredients,
  setRecipeNormalization,
} from "@/lib/ingredients";
import { accreteAliasesFromLines } from "@/lib/ingredientAliases";
import { getRecipeById } from "@/lib/recipes";
import { UsdaError, getFoodDetail, searchFoods } from "@/lib/usda";
import { makeIngredient, makeRecipe, makeRecipeIngredient } from "@/fixtures";
import { cuminDetailResponse, cuminExpectedNutrition } from "@/fixtures/usda";
import type { IngredientMatch } from "@/types/ingredient";
import type { RecipeRow, SchemaRecipe } from "@/types/recipe";

// LLM + external clients are mocked; the pure helpers stay REAL:
// parseIngredient (deterministic fallback), extractNutrition/deriveDensity
// (fed the mocked getFoodDetail's fixture), and ingredientFingerprint.
vi.mock("@/lib/gemini", () => ({ generateStructured: vi.fn() }));
vi.mock("@/lib/embedding", () => ({ generateEmbedding: vi.fn() }));
vi.mock("@/lib/usda", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/usda")>();
  return { ...actual, searchFoods: vi.fn(), getFoodDetail: vi.fn() };
});
vi.mock("@/lib/ingredients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ingredients")>();
  return {
    ...actual,
    createIngredientRow: vi.fn(),
    getIngredientByFdcId: vi.fn(),
    getIngredientsByIds: vi.fn(),
    getRecipeIngredients: vi.fn(),
    matchIngredients: vi.fn(),
    replaceRecipeIngredients: vi.fn(),
    setRecipeNormalization: vi.fn(),
  };
});
// Only the MUTATION is stubbed — ingredientQueryText stays real so these tests
// exercise the same query normalization production uses. Without this mock,
// persist's accretion would reach a live admin client.
vi.mock("@/lib/ingredientAliases", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ingredientAliases")>();
  return { ...actual, accreteAliasesFromLines: vi.fn() };
});
vi.mock("@/lib/recipes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/recipes")>();
  return { ...actual, getRecipeById: vi.fn() };
});

function makeTestRecipe(
  ingredients: SchemaRecipe["recipeIngredient"],
): RecipeRow {
  return makeRecipe("r-1", "Test Recipe", {
    metadata: {
      schema: { name: "Test Recipe", recipeIngredient: ingredients } as SchemaRecipe,
    },
  });
}

const CUMIN_PARSE = [{ quantity: 1, unit: "tsp", name: "cumin seed", note: null }];

function candidate(id: string, name: string, similarity: number): IngredientMatch {
  // `similarity` drives the semantic score the matcher thresholds on; the
  // keyword/fusion signals are irrelevant to these graph tests.
  return {
    id,
    name,
    nutrition: null,
    density_g_per_ml: null,
    semantic_similarity: similarity,
    keyword_similarity: similarity,
    score: similarity,
  };
}

function persistedRows() {
  return vi.mocked(replaceRecipeIngredients).mock.calls[0]?.[1];
}

function statusWrites() {
  return vi.mocked(setRecipeNormalization).mock.calls.map((c) => c[1]);
}

const recipe = makeTestRecipe(["1 tsp cumin seed"]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRecipeById).mockResolvedValue(recipe);
  vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2]);
  vi.mocked(generateStructured).mockResolvedValue(CUMIN_PARSE);
  vi.mocked(matchIngredients).mockResolvedValue([]);
  vi.mocked(getIngredientByFdcId).mockResolvedValue(null);
  vi.mocked(getIngredientsByIds).mockResolvedValue([]);
  vi.mocked(getRecipeIngredients).mockResolvedValue([]);
  vi.mocked(accreteAliasesFromLines).mockResolvedValue(undefined);
  vi.mocked(replaceRecipeIngredients).mockResolvedValue(undefined);
  vi.mocked(setRecipeNormalization).mockResolvedValue(undefined);
});

describe("runNormalization — matching", () => {
  it("auto-accepts a candidate above SIM_AUTO_ACCEPT and persists the match", async () => {
    vi.mocked(matchIngredients).mockResolvedValue([
      candidate("ing-1", "cumin seed", 0.9),
    ]);

    await runNormalization("r-1");

    expect(persistedRows()).toEqual([
      {
        ingredient_id: "ing-1",
        raw_text: "1 tsp cumin seed",
        quantity: 1,
        unit: "tsp",
        name_text: "cumin seed",
        note: null,
        match_status: "matched",
        confidence: 0.9,
        position: 0,
        // A weight-unit line (tsp × direct convert) needs no estimate.
        estimated_grams: null,
        grams_source: null,
      },
    ]);
    expect(statusWrites()).toEqual([
      { status: "running", error: null },
      {
        status: "completed",
        error: null,
        normalizedAt: expect.any(String),
        fingerprint: ingredientFingerprint(recipe.metadata.schema),
      },
    ]);
  });

  it("carries forward manual associations by raw_text over the automated match", async () => {
    // The user curated this line; a re-run's own matcher would pick ing-auto.
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, {
        raw_text: "1 tsp cumin seed",
        ingredient_id: "ing-manual",
        match_status: "manual",
      }),
    ]);
    vi.mocked(matchIngredients).mockResolvedValue([
      candidate("ing-auto", "cumin seed", 0.9),
    ]);

    await runNormalization("r-1");

    expect(persistedRows()).toEqual([
      expect.objectContaining({
        ingredient_id: "ing-manual",
        raw_text: "1 tsp cumin seed",
        match_status: "manual",
        confidence: null,
      }),
    ]);
  });

  it("does not carry a manual association onto a line whose text changed", async () => {
    // The manual match was for different text — the automated result wins.
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, {
        raw_text: "1 tsp ground cumin",
        ingredient_id: "ing-manual",
        match_status: "manual",
      }),
    ]);
    vi.mocked(matchIngredients).mockResolvedValue([
      candidate("ing-auto", "cumin seed", 0.9),
    ]);

    await runNormalization("r-1");

    expect(persistedRows()).toEqual([
      expect.objectContaining({
        ingredient_id: "ing-auto",
        match_status: "matched",
      }),
    ]);
  });

  it("falls back to the deterministic parser when the LLM parse is unavailable", async () => {
    vi.mocked(generateStructured).mockResolvedValue(null); // parse call fails
    vi.mocked(matchIngredients).mockResolvedValue([
      candidate("ing-1", "cumin seed", 0.9),
    ]);

    await runNormalization("r-1");

    // parseIngredient (real) extracts "1 tsp" and leaves "cumin seed".
    expect(persistedRows()?.[0]).toMatchObject({
      quantity: 1,
      unit: "tsp",
      name_text: "cumin seed",
      match_status: "matched",
    });
    const completed = statusWrites().find((w) => w.status === "completed");
    expect(completed?.error).toContain("deterministic");
  });

  it("sends the ambiguous band to adjudication and applies a candidate verdict", async () => {
    vi.mocked(matchIngredients).mockResolvedValue([
      candidate("ing-1", "cumin, ground", 0.7),
    ]);
    vi.mocked(generateStructured)
      .mockResolvedValueOnce(CUMIN_PARSE) // parse
      .mockResolvedValueOnce([{ position: 0, choice: "ing-1" }]); // adjudicate

    await runNormalization("r-1");

    expect(persistedRows()?.[0]).toMatchObject({
      ingredient_id: "ing-1",
      match_status: "matched",
      confidence: 0.7,
    });
  });

  it("persists ambiguous lines as unmatched when adjudication is unavailable", async () => {
    vi.mocked(matchIngredients).mockResolvedValue([
      candidate("ing-1", "cumin, ground", 0.7),
    ]);
    vi.mocked(generateStructured)
      .mockResolvedValueOnce(CUMIN_PARSE) // parse
      .mockResolvedValueOnce(null); // adjudicate fails

    await runNormalization("r-1");

    expect(persistedRows()?.[0]).toMatchObject({
      ingredient_id: null,
      match_status: "unmatched",
    });
    expect(searchFoods).not.toHaveBeenCalled();
  });

  it("fails the run without persisting when the match RPC is broken", async () => {
    // A broken RPC must not read as "no matches" — that would classify every
    // line as novel and mint duplicate ingredients.
    vi.mocked(matchIngredients).mockRejectedValue(
      new IngredientRepoError("match_failed", "function missing"),
    );

    await runNormalization("r-1");

    expect(replaceRecipeIngredients).not.toHaveBeenCalled();
    expect(statusWrites().at(-1)).toMatchObject({ status: "failed" });
  });
});

describe("runNormalization — novel ingredients", () => {
  beforeEach(() => {
    // No candidates → below SIM_NOVEL_FLOOR → novel.
    vi.mocked(matchIngredients).mockResolvedValue([]);
  });

  it("creates a catalog ingredient from USDA and links the line as novel", async () => {
    vi.mocked(generateStructured)
      .mockResolvedValueOnce(CUMIN_PARSE) // parse
      .mockResolvedValueOnce({ fdcId: 170923 }); // pick
    vi.mocked(searchFoods).mockResolvedValue([
      { fdcId: 170923, description: "Spices, cumin seed", dataType: "SR Legacy", score: 787 },
      { fdcId: 999, description: "Cumin bread", dataType: "SR Legacy", score: 100 },
    ]);
    vi.mocked(getFoodDetail).mockResolvedValue(cuminDetailResponse);
    vi.mocked(createIngredientRow).mockResolvedValue(
      makeIngredient("new-1", "Spices, cumin seed"),
    );

    await runNormalization("r-1");

    // Real extractNutrition ran against the abridged fixture detail. Abridged
    // never returns foodPortions, and the density-estimate generateStructured
    // call is unqueued here (returns undefined → estimate declines), so
    // density/food_portions persist as null.
    //
    // The row is named by USDA's description; the parsed recipe name is the
    // alias. One USDA food is one catalog row, whatever a recipe calls it.
    expect(createIngredientRow).toHaveBeenCalledWith({
      name: "Spices, cumin seed",
      aliases: ["cumin seed"],
      fdc_id: 170923,
      fdc_data_type: "SR Legacy",
      nutrition: cuminExpectedNutrition,
      density_g_per_ml: null,
      food_portions: null,
      source: "usda",
      embedding: [0.1, 0.2],
    });
    expect(persistedRows()?.[0]).toMatchObject({
      ingredient_id: "new-1",
      match_status: "novel",
    });
  });

  it("skips novel creation (line unmatched) when the new ingredient's embedding fails", async () => {
    vi.mocked(generateStructured)
      .mockResolvedValueOnce(CUMIN_PARSE) // parse
      .mockResolvedValueOnce({ fdcId: 170923 }); // pick
    vi.mocked(searchFoods).mockResolvedValue([
      { fdcId: 170923, description: "Spices, cumin seed", dataType: "SR Legacy" },
    ]);
    vi.mocked(getFoodDetail).mockResolvedValue(cuminDetailResponse);
    // First embed (for matching) succeeds; the novel-create embed fails. The
    // embedding column is NOT NULL, so the row is skipped rather than inserted.
    vi.mocked(generateEmbedding)
      .mockResolvedValueOnce([0.1, 0.2])
      .mockResolvedValueOnce(null);

    await runNormalization("r-1");

    expect(createIngredientRow).not.toHaveBeenCalled();
    expect(persistedRows()?.[0]).toMatchObject({
      ingredient_id: null,
      match_status: "unmatched",
    });
    const completed = statusWrites().find((w) => w.status === "completed");
    expect(completed?.error).toContain("skipped");
  });

  it("leaves the line unmatched when USDA has no results", async () => {
    vi.mocked(searchFoods).mockResolvedValue([]);

    await runNormalization("r-1");

    expect(persistedRows()?.[0]).toMatchObject({
      ingredient_id: null,
      match_status: "unmatched",
    });
    const completed = statusWrites().find((w) => w.status === "completed");
    expect(completed?.error).toContain("no results");
  });

  it("completes with the line unmatched when USDA errors (retryable via re-run)", async () => {
    vi.mocked(searchFoods).mockRejectedValue(new UsdaError(503, "USDA down"));

    await runNormalization("r-1");

    expect(persistedRows()?.[0]).toMatchObject({
      ingredient_id: null,
      match_status: "unmatched",
    });
    expect(statusWrites().at(-1)).toMatchObject({ status: "completed" });
  });

  it("reuses the row already holding this fdcId instead of re-importing", async () => {
    // The food is cataloged under a name the matcher didn't surface. fdc_id is
    // the identity key, so this resolves to the existing row — and spends no
    // USDA detail call doing it.
    vi.mocked(generateStructured)
      .mockResolvedValueOnce(CUMIN_PARSE)
      .mockResolvedValueOnce({ fdcId: 170923 });
    vi.mocked(searchFoods).mockResolvedValue([
      { fdcId: 170923, description: "Spices, cumin seed", dataType: "SR Legacy" },
    ]);
    vi.mocked(getIngredientByFdcId).mockResolvedValue(
      makeIngredient("existing-1", "Spices, cumin seed", { fdc_id: 170923 }),
    );

    await runNormalization("r-1");

    expect(getFoodDetail).not.toHaveBeenCalled();
    expect(createIngredientRow).not.toHaveBeenCalled();
    expect(persistedRows()?.[0]).toMatchObject({
      ingredient_id: "existing-1",
      match_status: "novel",
    });
  });

  it("resolves a concurrent create of the same food to the winner's row", async () => {
    vi.mocked(generateStructured)
      .mockResolvedValueOnce(CUMIN_PARSE)
      .mockResolvedValueOnce({ fdcId: 170923 });
    vi.mocked(searchFoods).mockResolvedValue([
      { fdcId: 170923, description: "Spices, cumin seed", dataType: "SR Legacy" },
    ]);
    vi.mocked(getFoodDetail).mockResolvedValue(cuminDetailResponse);
    vi.mocked(createIngredientRow).mockRejectedValue(
      new IngredientRepoError("conflict", "already exists"),
    );
    // Absent on the pre-check, present once the loser catches the conflict.
    vi.mocked(getIngredientByFdcId)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        makeIngredient("existing-1", "Spices, cumin seed", { fdc_id: 170923 }),
      );

    await runNormalization("r-1");

    expect(persistedRows()?.[0]).toMatchObject({
      ingredient_id: "existing-1",
      match_status: "novel",
    });
  });
});

describe("runNormalization — alias accretion", () => {
  it("teaches the catalog every persisted line's parsed name, in one batch", async () => {
    // Two lines resolving to one ingredient must produce a single accretion
    // call carrying both rows — the helper dedupes and batches per ingredient.
    vi.mocked(getRecipeById).mockResolvedValue(
      makeTestRecipe(["1 tsp cumin seed", "2 tsp ground cumin"]),
    );
    vi.mocked(generateStructured).mockResolvedValue([
      { quantity: 1, unit: "tsp", name: "cumin seed", note: null },
      { quantity: 2, unit: "tsp", name: "ground cumin", note: null },
    ]);
    vi.mocked(matchIngredients).mockResolvedValue([
      candidate("ing-1", "Spices, cumin seed", 0.9),
    ]);

    await runNormalization("r-1");

    expect(accreteAliasesFromLines).toHaveBeenCalledTimes(1);
    expect(accreteAliasesFromLines).toHaveBeenCalledWith([
      expect.objectContaining({ ingredient_id: "ing-1", name_text: "cumin seed" }),
      expect.objectContaining({ ingredient_id: "ing-1", name_text: "ground cumin" }),
    ]);
  });

  it("accretes after the rows land and before the run is marked complete", async () => {
    // Order matters: the catalog should only learn from associations that
    // actually persisted, and the run isn't complete until it has.
    vi.mocked(matchIngredients).mockResolvedValue([
      candidate("ing-1", "Spices, cumin seed", 0.9),
    ]);
    const order: string[] = [];
    vi.mocked(replaceRecipeIngredients).mockImplementation(async () => {
      order.push("replace");
    });
    vi.mocked(accreteAliasesFromLines).mockImplementation(async () => {
      order.push("accrete");
    });
    vi.mocked(setRecipeNormalization).mockImplementation(async () => {
      order.push("status");
    });

    await runNormalization("r-1");

    expect(order).toEqual(["status", "replace", "accrete", "status"]);
  });

  it("does NOT accrete when a newer save superseded the run", async () => {
    // The supersede guard skips the write entirely; the catalog must not learn
    // recipe language from lines that were never persisted.
    vi.mocked(matchIngredients).mockResolvedValue([
      candidate("ing-1", "Spices, cumin seed", 0.9),
    ]);
    vi.mocked(getRecipeById)
      .mockResolvedValueOnce(recipe)
      .mockResolvedValueOnce(makeTestRecipe(["1 tsp coriander"]));

    await runNormalization("r-1");

    expect(replaceRecipeIngredients).not.toHaveBeenCalled();
    expect(accreteAliasesFromLines).not.toHaveBeenCalled();
  });
});

describe("runNormalization — grams estimation", () => {
  it("estimates grams for a matched line the density path can't convert", async () => {
    // "1 tsp cumin seed" is a volume unit; the matched catalog row has no
    // density, so gramsForLine yields nothing → the estimate node fills it.
    vi.mocked(matchIngredients).mockResolvedValue([
      candidate("ing-1", "cumin seed", 0.9),
    ]);
    vi.mocked(getIngredientsByIds).mockResolvedValue([
      makeIngredient("ing-1", "cumin seed", { density_g_per_ml: null }),
    ]);
    vi.mocked(generateStructured)
      .mockResolvedValueOnce(CUMIN_PARSE) // parse
      .mockResolvedValueOnce({ grams: 26 }); // estimate

    await runNormalization("r-1");

    expect(persistedRows()?.[0]).toMatchObject({
      ingredient_id: "ing-1",
      estimated_grams: 26,
      grams_source: "llm",
    });
  });

  it("skips estimation when the line converts through density", async () => {
    vi.mocked(matchIngredients).mockResolvedValue([
      candidate("ing-1", "cumin seed", 0.9),
    ]);
    vi.mocked(getIngredientsByIds).mockResolvedValue([
      makeIngredient("ing-1", "cumin seed", { density_g_per_ml: 0.5 }),
    ]);
    // Default generateStructured → CUMIN_PARSE for parse; no estimate call.

    await runNormalization("r-1");

    expect(persistedRows()?.[0]).toMatchObject({
      estimated_grams: null,
      grams_source: null,
    });
    // Parse only — the estimate node never reached the model.
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  it("carries a prior estimate forward by raw_text without re-calling the model", async () => {
    vi.mocked(matchIngredients).mockResolvedValue([
      candidate("ing-1", "cumin seed", 0.9),
    ]);
    vi.mocked(getIngredientsByIds).mockResolvedValue([
      makeIngredient("ing-1", "cumin seed", { density_g_per_ml: null }),
    ]);
    vi.mocked(getRecipeIngredients).mockResolvedValue([
      makeRecipeIngredient("r-1", 0, {
        raw_text: "1 tsp cumin seed",
        estimated_grams: 40,
        grams_source: "manual",
      }),
    ]);

    await runNormalization("r-1");

    expect(persistedRows()?.[0]).toMatchObject({ estimated_grams: 40 });
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });
});

describe("runNormalization — lifecycle", () => {
  it("aborts persist when a newer save changed the ingredients mid-run", async () => {
    const newerRecipe = makeTestRecipe(["3 cups rice"]);
    vi.mocked(getRecipeById)
      .mockResolvedValueOnce(recipe) // run start
      .mockResolvedValueOnce(newerRecipe); // persist re-fetch
    vi.mocked(matchIngredients).mockResolvedValue([
      candidate("ing-1", "cumin seed", 0.9),
    ]);

    await runNormalization("r-1");

    expect(replaceRecipeIngredients).not.toHaveBeenCalled();
    // Only "running" was written — the newer save's own run owns the outcome.
    expect(statusWrites()).toEqual([{ status: "running", error: null }]);
  });

  it("clears rows and completes immediately for an ingredient-less recipe", async () => {
    vi.mocked(getRecipeById).mockResolvedValue(makeTestRecipe(undefined));

    await runNormalization("r-1");

    expect(replaceRecipeIngredients).toHaveBeenCalledWith("r-1", []);
    expect(generateStructured).not.toHaveBeenCalled();
    expect(statusWrites().at(-1)).toMatchObject({ status: "completed" });
  });

  it("does nothing when the recipe was deleted before the run started", async () => {
    vi.mocked(getRecipeById).mockResolvedValue(null);

    await runNormalization("r-1");

    expect(setRecipeNormalization).not.toHaveBeenCalled();
    expect(replaceRecipeIngredients).not.toHaveBeenCalled();
  });
});
