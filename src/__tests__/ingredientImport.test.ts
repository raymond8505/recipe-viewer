// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importUsdaIngredient } from "@/lib/ingredientImport";
import {
  IngredientRepoError,
  createIngredientRow,
  getIngredientByFdcId,
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

// The description of the fixture food, lowercased and joined with the parsed
// name — what ingredientEmbeddingText produces for a fresh import.
const EMBEDDED_TEXT = "spices, cumin seed, cumin seed";

describe("importUsdaIngredient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIngredientByFdcId).mockResolvedValue(null);
    vi.mocked(getFoodDetail).mockResolvedValue(cuminDetailResponse);
    vi.mocked(estimateDensity).mockResolvedValue(null);
    vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2]);
    vi.mocked(createIngredientRow).mockResolvedValue(
      makeIngredient("ing-new", cuminDetailResponse.description),
    );
  });

  it("names the row by the USDA description, with the parsed name as an alias", async () => {
    const row = await importUsdaIngredient("cumin seed", 170923);

    expect(row?.id).toBe("ing-new");
    expect(createIngredientRow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: cuminDetailResponse.description,
        aliases: ["cumin seed"],
        fdc_id: cuminDetailResponse.fdcId,
        fdc_data_type: cuminDetailResponse.dataType,
        nutrition: cuminExpectedNutrition,
        source: "usda",
        embedding: [0.1, 0.2],
      }),
    );
  });

  it("embeds the canonical name together with the alias", async () => {
    await importUsdaIngredient("cumin seed", 170923);

    expect(generateEmbedding).toHaveBeenCalledWith(EMBEDDED_TEXT);
  });

  it("preserves the parsed name's casing in aliases", async () => {
    // Aliases are display data — we show them back to the user, so the text is
    // stored exactly as received. Only matching folds case.
    await importUsdaIngredient("Cumin Seed", 170923);

    expect(createIngredientRow).toHaveBeenCalledWith(
      expect.objectContaining({ aliases: ["Cumin Seed"] }),
    );
  });

  it("adds no alias when the parsed name IS the description", async () => {
    await importUsdaIngredient("  spices, CUMIN seed  ", 170923);

    expect(createIngredientRow).toHaveBeenCalledWith(
      expect.objectContaining({ aliases: [] }),
    );
  });

  it("reuses an already-imported fdcId without spending USDA budget", async () => {
    // One USDA food is one catalog row. Re-picking a food someone already
    // imported must be idempotent, and must not cost a rate-limited round trip.
    const sameFood = makeIngredient("ing-existing", cuminDetailResponse.description, {
      fdc_id: cuminDetailResponse.fdcId,
    });
    vi.mocked(getIngredientByFdcId).mockResolvedValue(sameFood);

    const row = await importUsdaIngredient("cumin seed", 170923);

    expect(row).toEqual(sameFood);
    expect(getIngredientByFdcId).toHaveBeenCalledWith(170923);
    expect(getFoodDetail).not.toHaveBeenCalled();
    expect(createIngredientRow).not.toHaveBeenCalled();
  });

  it("fills density from the LLM estimate when the payload has no portions", async () => {
    // Abridged detail payloads never carry foodPortions, so the estimate is
    // the only density source on this path.
    vi.mocked(estimateDensity).mockResolvedValue(0.43);

    await importUsdaIngredient("cumin seed", 170923);

    // The estimator prompt reasons in recipe language, so it gets the parsed
    // name even though the row is named by the description.
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

  it("resolves a concurrent import of the same food to the winner's row", async () => {
    // Lost the race on the fdc_id index: take the winner rather than minting a
    // rival row for the same USDA record.
    const winner = makeIngredient("ing-existing", cuminDetailResponse.description, {
      fdc_id: cuminDetailResponse.fdcId,
    });
    vi.mocked(getIngredientByFdcId)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    vi.mocked(createIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("conflict", "taken"),
    );

    expect(await importUsdaIngredient("cumin seed", 170923)).toEqual(winner);
    expect(createIngredientRow).toHaveBeenCalledTimes(1);
  });

  it("disambiguates with the record id when a different food owns the description", async () => {
    // FDC reuses a description across data types, so lower(name) can be taken
    // by a genuinely different food. Suffixing beats failing the import.
    const suffixed = makeIngredient(
      "ing-suffixed",
      `${cuminDetailResponse.description} (FDC ${cuminDetailResponse.fdcId})`,
    );
    vi.mocked(createIngredientRow)
      .mockRejectedValueOnce(new IngredientRepoError("conflict", "taken"))
      .mockResolvedValueOnce(suffixed);

    const row = await importUsdaIngredient("cumin seed", 170923);

    expect(row).toEqual(suffixed);
    expect(createIngredientRow).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "Spices, cumin seed (FDC 170923)",
        aliases: ["cumin seed"],
        // The suffix is bookkeeping noise, so the description-derived vector
        // is reused rather than re-generated for the uglier name.
        embedding: [0.1, 0.2],
      }),
    );
    expect(generateEmbedding).toHaveBeenCalledTimes(1);
  });

  it("propagates a conflict on even the disambiguated name", async () => {
    vi.mocked(createIngredientRow).mockRejectedValue(
      new IngredientRepoError("conflict", "taken"),
    );

    const err = await importUsdaIngredient("cumin seed", 170923).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("conflict");
    expect(createIngredientRow).toHaveBeenCalledTimes(2);
  });

  it("propagates USDA failures", async () => {
    vi.mocked(getFoodDetail).mockRejectedValueOnce(new UsdaError(500, "down"));

    await expect(importUsdaIngredient("cumin seed", 170923)).rejects.toBeInstanceOf(
      UsdaError,
    );
  });
});
