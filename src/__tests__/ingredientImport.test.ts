// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importUsdaIngredient } from "@/lib/ingredientImport";
import {
  IngredientRepoError,
  createIngredientRow,
  getIngredientByFdcId,
  getIngredients,
} from "@/lib/ingredients";
import { generateEmbedding } from "@/lib/embedding";
import { getFoodDetail, UsdaError } from "@/lib/usda";
import { estimateDensity } from "@/lib/normalization/estimateDensity";
import { makeIngredient } from "@/fixtures";
import {
  cuminDetailResponse,
  cuminExpectedNutrition,
  cuminFoodPortions,
} from "@/fixtures/usda";

vi.mock("@/lib/ingredients", async (orig) => {
  const actual = await orig<typeof import("@/lib/ingredients")>();
  return {
    ...actual,
    createIngredientRow: vi.fn(),
    getIngredientByFdcId: vi.fn(),
    getIngredients: vi.fn(),
  };
});

vi.mock("@/lib/embedding", () => ({ generateEmbedding: vi.fn() }));

vi.mock("@/lib/usda", async (orig) => {
  const actual = await orig<typeof import("@/lib/usda")>();
  return { ...actual, getFoodDetail: vi.fn() };
});

vi.mock("@/lib/normalization/estimateDensity", () => ({
  estimateDensity: vi.fn(),
}));

describe("importUsdaIngredient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFoodDetail).mockResolvedValue(cuminDetailResponse);
    vi.mocked(estimateDensity).mockResolvedValue(null);
    vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2]);
    vi.mocked(createIngredientRow).mockResolvedValue(
      makeIngredient("ing-new", "gochujang"),
    );
  });

  it("creates the catalog row in recipe language with USDA provenance", async () => {
    const row = await importUsdaIngredient("cumin seed", 170923);

    expect(row?.id).toBe("ing-new");
    expect(createIngredientRow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "cumin seed",
        aliases: [cuminDetailResponse.description],
        fdc_id: cuminDetailResponse.fdcId,
        fdc_data_type: cuminDetailResponse.dataType,
        nutrition: cuminExpectedNutrition,
        source: "usda",
        embedding: [0.1, 0.2],
      }),
    );
  });

  it("fills density from the LLM estimate when the payload has no portions", async () => {
    // Abridged detail payloads never carry foodPortions, so the estimate is
    // the only density source on this path.
    vi.mocked(estimateDensity).mockResolvedValue(0.43);

    await importUsdaIngredient("cumin seed", 170923);

    expect(estimateDensity).toHaveBeenCalledWith({
      name: "cumin seed",
      usdaDescription: cuminDetailResponse.description,
    });
    expect(createIngredientRow).toHaveBeenCalledWith(
      expect.objectContaining({ density_g_per_ml: 0.43 }),
    );
  });

  it("persists a null density when the estimate declines", async () => {
    await importUsdaIngredient("cumin seed", 170923);

    expect(createIngredientRow).toHaveBeenCalledWith(
      expect.objectContaining({ density_g_per_ml: null }),
    );
  });

  it("prefers real USDA portions over the estimate when present", async () => {
    vi.mocked(getFoodDetail).mockResolvedValue({
      ...cuminDetailResponse,
      foodPortions: cuminFoodPortions,
    });

    await importUsdaIngredient("cumin seed", 170923);

    expect(estimateDensity).not.toHaveBeenCalled();
    expect(createIngredientRow).toHaveBeenCalledWith(
      expect.objectContaining({ density_g_per_ml: 0.416 }),
    );
  });

  it("returns null when no embedding can be generated (NOT NULL column)", async () => {
    vi.mocked(generateEmbedding).mockResolvedValue(null);

    expect(await importUsdaIngredient("cumin seed", 170923)).toBeNull();
    expect(createIngredientRow).not.toHaveBeenCalled();
  });

  it("resolves a unique-name race to the winner's row (default reuse)", async () => {
    const winner = makeIngredient("ing-existing", "cumin seed");
    vi.mocked(createIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("conflict", "taken"),
    );
    vi.mocked(getIngredients).mockResolvedValue({ data: [winner], count: 1 });

    expect(await importUsdaIngredient("Cumin Seed", 170923)).toEqual(winner);
    expect(createIngredientRow).toHaveBeenCalledTimes(1);
    expect(getIngredientByFdcId).not.toHaveBeenCalled();
  });

  it("reuses the row already holding this USDA record on a fork collision", async () => {
    // Re-picking the same food (or a food already imported under another
    // name) must be idempotent — no duplicate catalog row for one fdc_id.
    const sameFood = makeIngredient("ing-existing", "spices, cumin seed", {
      fdc_id: cuminDetailResponse.fdcId,
    });
    vi.mocked(createIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("conflict", "taken"),
    );
    vi.mocked(getIngredientByFdcId).mockResolvedValue(sameFood);

    const row = await importUsdaIngredient("cumin seed", 170923, {
      onConflict: "fork",
    });

    expect(row).toEqual(sameFood);
    expect(getIngredientByFdcId).toHaveBeenCalledWith(cuminDetailResponse.fdcId);
    expect(createIngredientRow).toHaveBeenCalledTimes(1);
  });

  it("forks a new row named by the USDA description when the taken name is a different food", async () => {
    // The user is correcting a mistaken earlier pick: the same-name row (a
    // different fdc_id) must stay untouched and the chosen food becomes its
    // own catalog row, recipe-language name kept as an alias.
    const forked = makeIngredient("ing-forked", cuminDetailResponse.description);
    vi.mocked(createIngredientRow)
      .mockRejectedValueOnce(new IngredientRepoError("conflict", "taken"))
      .mockResolvedValueOnce(forked);
    vi.mocked(getIngredientByFdcId).mockResolvedValue(null);
    vi.mocked(generateEmbedding).mockImplementation(async (text) =>
      text === cuminDetailResponse.description ? [0.3, 0.4] : [0.1, 0.2],
    );

    const row = await importUsdaIngredient("cumin seed", 170923, {
      onConflict: "fork",
    });

    expect(row).toEqual(forked);
    expect(createIngredientRow).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: cuminDetailResponse.description,
        aliases: ["cumin seed"],
        fdc_id: cuminDetailResponse.fdcId,
        nutrition: cuminExpectedNutrition,
        source: "usda",
        // The fork row's embedding embeds ITS name (the description), not the
        // recipe-language name the collision was on.
        embedding: [0.3, 0.4],
      }),
    );
  });

  it("retries the fork under an fdcId-suffixed name when the description is also taken", async () => {
    const forked = makeIngredient(
      "ing-forked",
      `${cuminDetailResponse.description} (USDA ${cuminDetailResponse.fdcId})`,
    );
    vi.mocked(createIngredientRow)
      .mockRejectedValueOnce(new IngredientRepoError("conflict", "taken"))
      .mockRejectedValueOnce(new IngredientRepoError("conflict", "taken"))
      .mockResolvedValueOnce(forked);
    vi.mocked(getIngredientByFdcId).mockResolvedValue(null);

    const row = await importUsdaIngredient("cumin seed", 170923, {
      onConflict: "fork",
    });

    expect(row).toEqual(forked);
    expect(createIngredientRow).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "Spices, cumin seed (USDA 170923)",
        aliases: ["cumin seed"],
      }),
    );
  });

  it("returns null when the fork embedding cannot be generated", async () => {
    vi.mocked(createIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("conflict", "taken"),
    );
    vi.mocked(getIngredientByFdcId).mockResolvedValue(null);
    vi.mocked(generateEmbedding).mockImplementation(async (text) =>
      text === cuminDetailResponse.description ? null : [0.1, 0.2],
    );

    expect(
      await importUsdaIngredient("cumin seed", 170923, { onConflict: "fork" }),
    ).toBeNull();
    expect(createIngredientRow).toHaveBeenCalledTimes(1);
  });

  it("rethrows when both fork names are taken", async () => {
    vi.mocked(createIngredientRow).mockRejectedValue(
      new IngredientRepoError("conflict", "taken"),
    );
    vi.mocked(getIngredientByFdcId).mockResolvedValue(null);

    const err = await importUsdaIngredient("cumin seed", 170923, {
      onConflict: "fork",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("conflict");
    expect(createIngredientRow).toHaveBeenCalledTimes(3);
  });

  it("rethrows an unresolvable conflict", async () => {
    vi.mocked(createIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("conflict", "taken"),
    );
    vi.mocked(getIngredients).mockResolvedValue({ data: [], count: 0 });

    const err = await importUsdaIngredient("cumin seed", 170923).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("conflict");
  });

  it("propagates USDA failures", async () => {
    vi.mocked(getFoodDetail).mockRejectedValueOnce(new UsdaError(500, "down"));

    await expect(importUsdaIngredient("cumin seed", 170923)).rejects.toBeInstanceOf(
      UsdaError,
    );
  });
});
