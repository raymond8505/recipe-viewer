// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importUsdaIngredient } from "@/lib/ingredientImport";
import {
  IngredientRepoError,
  createIngredientRow,
  getIngredients,
  updateIngredientRow,
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
    getIngredients: vi.fn(),
    updateIngredientRow: vi.fn(),
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
    expect(updateIngredientRow).not.toHaveBeenCalled();
  });

  it("overwrites the same-name row in place with onConflict=overwrite", async () => {
    // The user's manual USDA pick is authoritative: the existing row's stale
    // values (e.g. a wrong earlier import) are replaced with the chosen food's.
    const stale = makeIngredient("ing-existing", "cumin seed", {
      nutrition: { calories_kcal: 999 },
      fdc_id: 111,
    });
    const overwritten = makeIngredient("ing-existing", "cumin seed", {
      nutrition: cuminExpectedNutrition,
      fdc_id: cuminDetailResponse.fdcId,
    });
    vi.mocked(createIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("conflict", "taken"),
    );
    vi.mocked(getIngredients).mockResolvedValue({ data: [stale], count: 1 });
    vi.mocked(updateIngredientRow).mockResolvedValue(overwritten);

    const row = await importUsdaIngredient("cumin seed", 170923, {
      onConflict: "overwrite",
    });

    expect(row).toEqual(overwritten);
    expect(updateIngredientRow).toHaveBeenCalledWith(
      "ing-existing",
      expect.objectContaining({
        aliases: [cuminDetailResponse.description],
        fdc_id: cuminDetailResponse.fdcId,
        nutrition: cuminExpectedNutrition,
        source: "usda",
      }),
    );
  });

  it("still rethrows an unresolvable conflict under overwrite", async () => {
    vi.mocked(createIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("conflict", "taken"),
    );
    vi.mocked(getIngredients).mockResolvedValue({ data: [], count: 0 });

    const err = await importUsdaIngredient("cumin seed", 170923, {
      onConflict: "overwrite",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IngredientRepoError);
    expect(updateIngredientRow).not.toHaveBeenCalled();
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
