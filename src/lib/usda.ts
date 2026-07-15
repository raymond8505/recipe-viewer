import { env } from "@/env";
import { fetchWithRetry } from "./retry";
import { convert, isVolumeUnit, unitKeyForAlias } from "./units";
import type { IngredientNutrition, UsdaFoodPortion } from "@/types/ingredient";

// USDA FoodData Central client (https://fdc.nal.usda.gov/api-guide/).
// Raw fetch like src/lib/embedding.ts — no SDK. Rate limit is 1,000
// requests/hour per api.data.gov key; the normalization workflow only reaches
// this for novel ingredients, so ordinary recipe traffic stays far below it.

const BASE_URL = "https://api.nal.usda.gov/fdc/v1";

// Analytical per-100g datasets only. Branded/Survey(FNDDS) foods use
// serving-size semantics and label-rounded values — wrong basis for a
// per-100g catalog.
const DATA_TYPES = "Foundation,SR Legacy";

const SEARCH_PAGE_SIZE = 5;

// Unlike the best-effort Gemini clients (null on failure), USDA failures THROW
// so the normalization graph can distinguish "USDA is down" (leave the line
// unmatched, retryable) from "USDA has no such food" (empty search results).
export class UsdaError extends Error {
  constructor(
    public status: number | null,
    detail: string,
  ) {
    super(detail);
    this.name = "UsdaError";
  }
}

export interface UsdaSearchFood {
  fdcId: number;
  description: string;
  dataType: string;
  score?: number;
}

interface SearchResponse {
  foods?: UsdaSearchFood[];
}

// The DETAIL endpoint's nutrient shape is nested — different from the flat
// shape the search endpoint returns — and category-header rows (e.g.
// "Proximates") carry no `amount`. Verified against real payloads (SR Legacy
// fdcId 170923), fixtures in src/fixtures/usda.ts.
export interface UsdaFoodDetail {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients?: Array<{
    nutrient?: { id?: number; name?: string; unitName?: string };
    amount?: number;
  }>;
  foodPortions?: UsdaFoodPortion[];
}

async function fetchJson<T>(url: URL, context: string): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithRetry(url);
  } catch (err) {
    throw new UsdaError(null, `${context} request failed: ${String(err)}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new UsdaError(res.status, `${context} failed (${res.status}): ${detail}`);
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new UsdaError(null, `${context} returned malformed JSON: ${String(err)}`);
  }
}

/** Search Foundation + SR Legacy foods by keyword; top matches by FDC score. */
export async function searchFoods(query: string): Promise<UsdaSearchFood[]> {
  const url = new URL(`${BASE_URL}/foods/search`);
  url.searchParams.set("api_key", env.USDA_API_KEY);
  url.searchParams.set("query", query);
  url.searchParams.set("dataType", DATA_TYPES);
  url.searchParams.set("pageSize", String(SEARCH_PAGE_SIZE));

  const body = await fetchJson<SearchResponse>(url, "USDA food search");
  return (body.foods ?? []).map((food) => ({
    fdcId: food.fdcId,
    description: food.description,
    dataType: food.dataType,
    score: food.score,
  }));
}

/** Fetch one food's full record (nested nutrients + foodPortions). */
export async function getFoodDetail(fdcId: number): Promise<UsdaFoodDetail> {
  const url = new URL(`${BASE_URL}/food/${fdcId}`);
  url.searchParams.set("api_key", env.USDA_API_KEY);

  return fetchJson<UsdaFoodDetail>(url, `USDA food detail ${fdcId}`);
}

// USDA nutrient id → IngredientNutrition field. The "core label set" decided
// against real payloads; per-100g for Foundation/SR Legacy. Ids are stable
// across both data types. Unmapped nutrients (~50-60 per food) are ignored —
// fdc_id is kept on the ingredient row, so widening this set later is a
// re-fetch, not a migration.
const NUTRIENT_FIELD_BY_USDA_ID: Record<number, keyof IngredientNutrition> = {
  1008: "calories_kcal",
  1003: "protein_g",
  1004: "fat_g",
  1258: "saturated_fat_g",
  1005: "carbs_g",
  1079: "fiber_g",
  2000: "sugars_g",
  1093: "sodium_mg",
  1253: "cholesterol_mg",
  1087: "calcium_mg",
  1089: "iron_mg",
  1092: "potassium_mg",
};

/** Map a detail payload's nested nutrients onto the core label set. */
export function extractNutrition(detail: UsdaFoodDetail): IngredientNutrition {
  const nutrition: IngredientNutrition = {};
  for (const entry of detail.foodNutrients ?? []) {
    const id = entry.nutrient?.id;
    // Category-header rows ("Proximates", "Minerals", ...) have no amount.
    if (id === undefined || typeof entry.amount !== "number") continue;
    const field = NUTRIENT_FIELD_BY_USDA_ID[id];
    if (field) nutrition[field] = entry.amount;
  }
  return nutrition;
}

// A portion's household-measure text: SR Legacy hides it in `modifier`
// (e.g. "tsp, whole") with measureUnit.name "undetermined"; Foundation foods
// may populate measureUnit.name properly. Try measureUnit first, then the
// modifier's leading comma-token.
function portionVolumeUnit(portion: UsdaFoodPortion): string | null {
  const candidates = [
    portion.measureUnit?.name,
    portion.modifier?.split(",")[0],
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const key = unitKeyForAlias(candidate);
    if (key && isVolumeUnit(key)) return key;
  }
  return null;
}

/**
 * Derive weight-per-volume (g/ml) from a food's volume-unit portions —
 * e.g. cumin seed's "1 tsp = 2.1 g" → 2.1 / 4.92892 ≈ 0.426 g/ml. Median
 * across portions damps outlier measures; 3 decimal places. Returns null when
 * no portion carries a recognizable volume unit (weight-only or count-only
 * portions can't yield a density).
 */
export function deriveDensity(
  portions: UsdaFoodPortion[] | undefined,
): number | null {
  const densities: number[] = [];

  for (const portion of portions ?? []) {
    if (typeof portion.gramWeight !== "number" || portion.gramWeight <= 0) continue;
    const amount = portion.amount ?? 1;
    if (amount <= 0) continue;

    const unitKey = portionVolumeUnit(portion);
    if (!unitKey) continue;

    const ml = convert(amount, unitKey, "ml");
    if (ml > 0) densities.push(portion.gramWeight / ml);
  }

  if (densities.length === 0) return null;

  densities.sort((a, b) => a - b);
  const mid = Math.floor(densities.length / 2);
  const median =
    densities.length % 2 === 1
      ? densities[mid]
      : (densities[mid - 1] + densities[mid]) / 2;

  return Math.round(median * 1000) / 1000;
}
