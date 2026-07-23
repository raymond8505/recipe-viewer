// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importUsdaIngredient } from "@/lib/ingredientImport";
import {
  IngredientRepoError,
  createIngredientRow,
  getIngredients,
} from "@/lib/ingredients";
import { generateEmbedding } from "@/lib/embedding";
import { getFoodDetail, UsdaError } from "@/lib/usda";
import { makeIngredient } from "@/fixtures";
import { cuminDetailResponse, cuminExpectedNutrition } from "@/fixtures/usda";

vi.mock("@/lib/ingredients", async (orig) => {
  const actual = await orig<typeof import("@/lib/ingredients")>();
  return { ...actual, createIngredientRow: vi.fn(), getIngredients: vi.fn() };
});

vi.mock("@/lib/embedding", () => ({ generateEmbedding: vi.fn() }));

vi.mock("@/lib/usda", async (orig) => {
  const actual = await orig<typeof import("@/lib/usda")>();
  return { ...actual, getFoodDetail: vi.fn() };
});

describe("importUsdaIngredient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFoodDetail).mockResolvedValue(cuminDetailResponse);
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

  it("returns null when no embedding can be generated (NOT NULL column)", async () => {
    vi.mocked(generateEmbedding).mockResolvedValue(null);

    expect(await importUsdaIngredient("cumin seed", 170923)).toBeNull();
    expect(createIngredientRow).not.toHaveBeenCalled();
  });

  it("resolves a unique-name race to the winner's row", async () => {
    const winner = makeIngredient("ing-existing", "cumin seed");
    vi.mocked(createIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("conflict", "taken"),
    );
    vi.mocked(getIngredients).mockResolvedValue({ data: [winner], count: 1 });

    expect(await importUsdaIngredient("Cumin Seed", 170923)).toEqual(winner);
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
