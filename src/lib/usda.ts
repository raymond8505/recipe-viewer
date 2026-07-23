import { env } from "@/env";
import { fetchWithRetry } from "./retry";
import { convert, isVolumeUnit, unitKeyForAlias } from "./units";
import type { IngredientNutrition, UsdaFoodPortion } from "@/types/ingredient";

// USDA FoodData Central client (https://fdc.nal.usda.gov/api-guide/).
// Raw fetch like src/lib/embedding.ts — no SDK. Rate limit is 1,000
// requests/hour per api.data.gov key; the normalization workflow only reaches
// this for novel ingredients, so ordinary recipe traffic stays far below it.

const BASE_URL = "https://api.nal.usda.gov/fdc/v1";

// Analytical per-100g datasets — the default and the automation bar.
// Branded foods are opt-in (manual curation only): their DETAIL payloads do
// report foodNutrients per 100 g/ml (only labelNutrients is per-serving),
// but values are label-rounded and there are no foodPortions, so they're a
// human-in-the-loop choice, never an automated match. FNDDS stays excluded.
const DATA_TYPES = "Foundation,SR Legacy";
const DATA_TYPES_WITH_BRANDED = `${DATA_TYPES},Branded`;

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

/**
 * Search USDA foods by keyword; top matches by FDC score. Defaults to the
 * analytical datasets (Foundation + SR Legacy); `includeBranded` widens to
 * Branded for the manual curation path.
 */
export async function searchFoods(
  query: string,
  opts?: { includeBranded?: boolean; pageSize?: number },
): Promise<UsdaSearchFood[]> {
  const url = new URL(`${BASE_URL}/foods/search`);
  url.searchParams.set("api_key", env.USDA_API_KEY);
  url.searchParams.set("query", query);
  url.searchParams.set(
    "dataType",
    opts?.includeBranded ? DATA_TYPES_WITH_BRANDED : DATA_TYPES,
  );
  url.searchParams.set("pageSize", String(opts?.pageSize ?? SEARCH_PAGE_SIZE));

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

// Energy is the one nutrient whose id differs by data type. SR Legacy reports
// kcal under 1008 (in the map above), but Foundation foods OMIT 1008 and carry
// only the calculated Atwater energies — 2048 (specific factors, food-tuned and
// closest to the SR Legacy basis) and 2047 (general factors, the fallback).
// Verified against a real payload (Foundation "chicken breast" fdcId 2646170:
// 2047=106, 2048=112, no 1008). Without this every Foundation food persists
// calorie-less. Prefer specific, then general; 1008 is handled by the main map.
const ENERGY_KCAL_IDS_BY_PRIORITY = [2048, 2047];

/** Map a detail payload's nested nutrients onto the core label set. */
export function extractNutrition(detail: UsdaFoodDetail): IngredientNutrition {
  const amountByNutrientId = new Map<number, number>();
  for (const entry of detail.foodNutrients ?? []) {
    const id = entry.nutrient?.id;
    // Category-header rows ("Proximates", "Minerals", ...) have no amount.
    if (id === undefined || typeof entry.amount !== "number") continue;
    if (!amountByNutrientId.has(id)) amountByNutrientId.set(id, entry.amount);
  }

  const nutrition: IngredientNutrition = {};
  for (const [idStr, field] of Object.entries(NUTRIENT_FIELD_BY_USDA_ID)) {
    const amount = amountByNutrientId.get(Number(idStr));
    if (amount !== undefined) nutrition[field] = amount;
  }

  // Foundation-food energy fallback (see ENERGY_KCAL_IDS_BY_PRIORITY).
  if (nutrition.calories_kcal === undefined) {
    for (const id of ENERGY_KCAL_IDS_BY_PRIORITY) {
      const amount = amountByNutrientId.get(id);
      if (amount !== undefined) {
        nutrition.calories_kcal = amount;
        break;
      }
    }
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
