// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UsdaError,
  deriveDensity,
  extractNutrition,
  getFoodDetail,
  searchFoods,
} from "@/lib/usda";
import {
  cuminDetailResponse,
  cuminExpectedNutrition,
  cuminSearchResponse,
} from "@/fixtures/usda";

// Module-level createEnv captures runtimeEnv at import time — mock with inline
// literals (factories are hoisted; no module consts).
vi.mock("@/env", () => ({
  env: { USDA_API_KEY: "test-usda-key" },
}));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("searchFoods", () => {
  it("queries the search endpoint with key, dataType filter, and page size", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(cuminSearchResponse));

    await searchFoods("cumin seed");

    const url = mockFetch.mock.calls[0][0] as URL;
    expect(url.origin + url.pathname).toBe(
      "https://api.nal.usda.gov/fdc/v1/foods/search",
    );
    expect(url.searchParams.get("api_key")).toBe("test-usda-key");
    expect(url.searchParams.get("query")).toBe("cumin seed");
    expect(url.searchParams.get("dataType")).toBe("Foundation,SR Legacy");
    expect(url.searchParams.get("pageSize")).toBe("5");
  });

  it("trims results to fdcId/description/dataType/score", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(cuminSearchResponse));

    const foods = await searchFoods("cumin seed");

    expect(foods).toEqual([
      {
        fdcId: 170923,
        description: "Spices, cumin seed",
        dataType: "SR Legacy",
        score: 787.51,
      },
      {
        fdcId: 170145,
        description: "Seeds, breadfruit seeds, boiled",
        dataType: "SR Legacy",
        score: 400.02,
      },
    ]);
  });

  it("returns an empty list when the payload has no foods", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ totalHits: 0 }));

    expect(await searchFoods("xyzzy")).toEqual([]);
  });

  it("throws UsdaError with the status on non-200", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "over limit" }, 429));

    const err = await searchFoods("cumin").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UsdaError);
    expect((err as UsdaError).status).toBe(429);
  });

  it("wraps network failures in UsdaError with null status", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const err = await searchFoods("cumin").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UsdaError);
    expect((err as UsdaError).status).toBeNull();
  });
});

describe("getFoodDetail", () => {
  it("fetches the food by fdcId with the api key", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(cuminDetailResponse));

    const detail = await getFoodDetail(170923);

    const url = mockFetch.mock.calls[0][0] as URL;
    expect(url.origin + url.pathname).toBe(
      "https://api.nal.usda.gov/fdc/v1/food/170923",
    );
    expect(url.searchParams.get("api_key")).toBe("test-usda-key");
    expect(detail.description).toBe("Spices, cumin seed");
  });

  it("throws UsdaError on non-200", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "nope" }, 404));

    const err = await getFoodDetail(1).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UsdaError);
    expect((err as UsdaError).status).toBe(404);
  });

  it("throws UsdaError on malformed JSON", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("<html>gateway</html>", { status: 200 }),
    );

    const err = await getFoodDetail(1).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UsdaError);
    expect((err as UsdaError).status).toBeNull();
  });
});

describe("extractNutrition", () => {
  it("maps the nested detail nutrients onto the exact core label set", () => {
    // Also proves: the amount-less "Proximates" header row is skipped, and the
    // unmapped Magnesium entry is ignored.
    expect(extractNutrition(cuminDetailResponse)).toEqual(
      cuminExpectedNutrition,
    );
  });

  it("keeps genuine zero values (cholesterol 0 ≠ missing)", () => {
    expect(extractNutrition(cuminDetailResponse).cholesterol_mg).toBe(0);
  });

  it("returns an empty object when nutrients are absent", () => {
    expect(
      extractNutrition({ fdcId: 1, description: "x", dataType: "SR Legacy" }),
    ).toEqual({});
  });
});

describe("deriveDensity", () => {
  it("derives the median g/ml from SR Legacy modifier-style volume portions", () => {
    // 2.1g/tsp → 0.42606; 6g/tbsp → 0.40577; median (avg of the two) → 0.416
    expect(deriveDensity(cuminDetailResponse.foodPortions)).toBe(0.416);
  });

  it("reads Foundation-style measureUnit.name when populated", () => {
    // All-purpose flour: 1 cup = 125 g → 125 / 236.588 ≈ 0.528
    expect(
      deriveDensity([
        { gramWeight: 125, amount: 1, measureUnit: { name: "cup" } },
      ]),
    ).toBe(0.528);
  });

  it("defaults amount to 1 when the portion omits it", () => {
    expect(deriveDensity([{ gramWeight: 236.588, modifier: "cup" }])).toBe(1);
  });

  it("ignores weight-only and unrecognizable portions", () => {
    expect(
      deriveDensity([
        { gramWeight: 28.35, modifier: "oz" },
        { gramWeight: 118, modifier: "1 medium" },
      ]),
    ).toBeNull();
  });

  it("returns null for missing or empty portions", () => {
    expect(deriveDensity(undefined)).toBeNull();
    expect(deriveDensity([])).toBeNull();
  });
});
