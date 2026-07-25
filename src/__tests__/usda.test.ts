// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UsdaError,
  deriveDensity,
  extractNutrition,
  getFoodDetail,
  searchFoods,
  searchFoodsMixed,
} from "@/lib/usda";
import {
  cuminDetailResponse,
  cuminExpectedNutrition,
  cuminFoodPortions,
  cuminSearchResponse,
  eggDetailResponse,
  eggExpectedNutrition,
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

  it("widens to Branded and a custom page size only when asked", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(cuminSearchResponse));

    await searchFoods("gochujang", { includeBranded: true, pageSize: 8 });

    const url = mockFetch.mock.calls[0][0] as URL;
    expect(url.searchParams.get("dataType")).toBe("Foundation,SR Legacy,Branded");
    expect(url.searchParams.get("pageSize")).toBe("8");
  });

  it("restricts to Branded with brandedOnly", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ foods: [] }));

    await searchFoods("chickpeas", { brandedOnly: true });

    expect((mockFetch.mock.calls[0][0] as URL).searchParams.get("dataType")).toBe(
      "Branded",
    );
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

  it("throws UsdaError with the status on a non-retryable non-200", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "not found" }, 404));

    const err = await searchFoods("cumin").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UsdaError);
    expect((err as UsdaError).status).toBe(404);
  });

  // Transient failures now go through fetchWithRetry (in fetchJson). Fake timers
  // drive the backoff so these don't actually wait.
  describe("retry behavior", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("retries then throws UsdaError with the status on a persistent 429", async () => {
      mockFetch.mockResolvedValue(jsonResponse({ error: "over limit" }, 429));

      const outcome = searchFoods("cumin").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(60_000);
      const err = await outcome;

      expect(err).toBeInstanceOf(UsdaError);
      expect((err as UsdaError).status).toBe(429);
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 attempt + 2 retries
    });

    it("retries then wraps a persistent network failure in UsdaError (null status)", async () => {
      mockFetch.mockRejectedValue(new TypeError("fetch failed"));

      const outcome = searchFoods("cumin").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(60_000);
      const err = await outcome;

      expect(err).toBeInstanceOf(UsdaError);
      expect((err as UsdaError).status).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("recovers when a transient 503 is followed by success", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 503))
        .mockResolvedValueOnce(jsonResponse(cuminSearchResponse));

      const p = searchFoods("cumin seed");
      await vi.advanceTimersByTimeAsync(60_000);
      const foods = await p;

      expect(foods).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe("searchFoodsMixed", () => {
  const analytical = {
    foods: [
      { fdcId: 10, description: "Chickpeas, canned, drained", dataType: "SR Legacy", score: 260 },
      { fdcId: 11, description: "Chickpeas, dry", dataType: "Foundation", score: 330 },
    ],
  };
  const branded = {
    foods: [
      { fdcId: 20, description: "CHICKPEAS", dataType: "Branded", score: 1181 },
      // USDA returns many identical Branded descriptions — they must collapse.
      { fdcId: 21, description: "chickpeas", dataType: "Branded", score: 1181 },
      { fdcId: 22, description: "Organic Chickpeas", dataType: "Branded", score: 900 },
    ],
  };

  it("queries both pools separately and round-robin interleaves them", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(analytical)) // analytical query
      .mockResolvedValueOnce(jsonResponse(branded)); // brandedOnly query

    const foods = await searchFoodsMixed("chickpeas", { pageSize: 10 });

    // Two separate queries: analytical (no Branded) + brandedOnly.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect((mockFetch.mock.calls[0][0] as URL).searchParams.get("dataType")).toBe(
      "Foundation,SR Legacy",
    );
    expect((mockFetch.mock.calls[1][0] as URL).searchParams.get("dataType")).toBe(
      "Branded",
    );

    // Interleaved a0, b0, a1, b1… with the duplicate "chickpeas" Branded row
    // (fdcId 21) collapsed by lowercased description.
    expect(foods.map((f) => f.fdcId)).toEqual([10, 20, 11, 22]);
  });

  it("caps the merged list at pageSize", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(analytical))
      .mockResolvedValueOnce(jsonResponse(branded));

    const foods = await searchFoodsMixed("chickpeas", { pageSize: 2 });

    expect(foods.map((f) => f.fdcId)).toEqual([10, 20]);
  });
});

describe("getFoodDetail", () => {
  it("fetches the food by fdcId in abridged format with the api key", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(cuminDetailResponse));

    const detail = await getFoodDetail(170923);

    const url = mockFetch.mock.calls[0][0] as URL;
    expect(url.origin + url.pathname).toBe(
      "https://api.nal.usda.gov/fdc/v1/food/170923",
    );
    expect(url.searchParams.get("api_key")).toBe("test-usda-key");
    // Abridged is load-bearing: the default full format 404s Foundation
    // records (2026-07 upstream regression).
    expect(url.searchParams.get("format")).toBe("abridged");
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
  it("maps the abridged NDB-number nutrients onto the exact core label set", () => {
    // Also proves: the kJ Energy row (268) never wins over 208 kcal, and the
    // unmapped Magnesium entry (304) is ignored.
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

  it("falls back to 269.3 for Foundation foods that report sugars there", () => {
    // Foundation egg carries "Sugars, Total" under 269.3 and has NO 269 row —
    // without the fallback every Foundation food would persist sugar-less. The
    // sucrose/glucose component rows (210/211) must not leak in either.
    expect(extractNutrition(eggDetailResponse)).toEqual(eggExpectedNutrition);
  });

  it("prefers the SR Legacy sugars number (269) over 269.3 when both exist", () => {
    const nutrition = extractNutrition({
      fdcId: 1,
      description: "x",
      dataType: "SR Legacy",
      foodNutrients: [
        { number: "269", name: "Total Sugars", amount: 5, unitName: "G" },
        { number: "269.3", name: "Sugars, Total", amount: 999, unitName: "G" },
      ],
    });
    expect(nutrition.sugars_g).toBe(5);
  });

  it("skips entries without a number or a numeric amount", () => {
    const nutrition = extractNutrition({
      fdcId: 1,
      description: "x",
      dataType: "Foundation",
      foodNutrients: [
        { name: "Energy", unitName: "KCAL", amount: 100 },
        { number: "208", name: "Energy", unitName: "KCAL" },
        { number: "203", name: "Protein", amount: 12.4, unitName: "G" },
      ],
    });
    expect(nutrition).toEqual({ protein_g: 12.4 });
  });
});

describe("deriveDensity", () => {
  it("derives the median g/ml from SR Legacy modifier-style volume portions", () => {
    // 2.1g/tsp → 0.42606; 6g/tbsp → 0.40577; median (avg of the two) → 0.416
    expect(deriveDensity(cuminFoodPortions)).toBe(0.416);
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
