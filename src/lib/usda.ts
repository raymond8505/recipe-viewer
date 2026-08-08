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

// The ABRIDGED detail shape: flat nutrient entries keyed by legacy NDB
// `number` (a string — Foundation uses dotted numbers like "269.3"), no
// nested `nutrient.id` and no foodPortions. Verified against real abridged
// payloads (Foundation 748967, SR Legacy 170923), fixtures in
// src/fixtures/usda.ts.
export interface UsdaFoodDetail {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients?: Array<{
    number?: string;
    name?: string;
    unitName?: string;
    amount?: number;
  }>;
  /**
   * Never populated by the abridged format — kept on the type so the import
   * row shape (food_portions / density) stays compilable and revivable if the
   * full format is ever restored (see getFoodDetail).
   */
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
 * Branded, and `brandedOnly` restricts to Branded (used to query the pools
 * separately in searchFoodsMixed).
 */
export async function searchFoods(
  query: string,
  opts?: { includeBranded?: boolean; brandedOnly?: boolean; pageSize?: number },
): Promise<UsdaSearchFood[]> {
  const dataType = opts?.brandedOnly
    ? "Branded"
    : opts?.includeBranded
      ? DATA_TYPES_WITH_BRANDED
      : DATA_TYPES;

  const url = new URL(`${BASE_URL}/foods/search`);
  url.searchParams.set("api_key", env.USDA_API_KEY);
  url.searchParams.set("query", query);
  url.searchParams.set("dataType", dataType);
  url.searchParams.set("pageSize", String(opts?.pageSize ?? SEARCH_PAGE_SIZE));

  const body = await fetchJson<SearchResponse>(url, "USDA food search");
  return (body.foods ?? []).map((food) => ({
    fdcId: food.fdcId,
    description: food.description,
    dataType: food.dataType,
    score: food.score,
  }));
}

/**
 * Manual-import search: the analytical (Foundation + SR Legacy) and Branded
 * pools are queried SEPARATELY and round-robin merged, so the high-value
 * analytical foods (real per-100g + portions → density) always surface. A
 * single combined query can't do this — Branded exact-name matches score far
 * higher (e.g. six identical "CHICKPEAS" at ~1181 vs. the canned/dry SR Legacy
 * foods at ~260-330), so they fill every top slot. Each pool stays ranked by
 * USDA score; interleaving keeps both visible near the top, and near-duplicate
 * Branded rows (USDA returns many identical descriptions) collapse by
 * lowercased description.
 */
export async function searchFoodsMixed(
  query: string,
  opts?: { pageSize?: number },
): Promise<UsdaSearchFood[]> {
  const pageSize = opts?.pageSize ?? 10;
  const [analytical, branded] = await Promise.all([
    searchFoods(query, { pageSize }),
    searchFoods(query, { brandedOnly: true, pageSize }),
  ]);

  const seen = new Set<string>();
  const merged: UsdaSearchFood[] = [];
  const rounds = Math.max(analytical.length, branded.length);
  for (let i = 0; i < rounds && merged.length < pageSize; i++) {
    for (const food of [analytical[i], branded[i]]) {
      if (!food || merged.length >= pageSize) continue;
      const key = `${food.dataType}:${food.description.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(food);
    }
  }
  return merged;
}

/**
 * Fetch one food's ABRIDGED record. Abridged deliberately, since 2026-07:
 * USDA 404s every Foundation record on the default full format (verified with
 * USDA's own documented DEMO_KEY sample) while abridged keeps working — and
 * abridged carries the entire tracked nutrient set. The cost is foodPortions
 * (full-format only), so USDA imports persist density_g_per_ml/food_portions
 * as null; fdc_id stays on the row, so a re-import can backfill them if the
 * full format is ever restored.
 */
export async function getFoodDetail(fdcId: number): Promise<UsdaFoodDetail> {
  const url = new URL(`${BASE_URL}/food/${fdcId}`);
  url.searchParams.set("api_key", env.USDA_API_KEY);
  url.searchParams.set("format", "abridged");

  return fetchJson<UsdaFoodDetail>(url, `USDA food detail ${fdcId}`);
}

// NDB nutrient number → IngredientNutrition field. Abridged entries carry the
// legacy NDB *number* (string), not the nested nutrient.id the full format
// used. Numbers verified against real abridged payloads of both data types
// (Foundation 748967, SR Legacy 170923); per-100g in both. Keying strictly by
// number also sidesteps the duplicate "Energy" row — kJ lives under 268 and
// must never win over 208 kcal. Unmapped nutrients (~50-80 per food) are
// ignored — fdc_id is kept on the ingredient row, so widening this set later
// is a re-fetch, not a migration.
const NUTRIENT_FIELD_BY_NDB_NUMBER: Record<string, keyof IngredientNutrition> = {
  "208": "calories_kcal",
  "203": "protein_g",
  "204": "fat_g",
  "606": "saturated_fat_g",
  "205": "carbs_g",
  "291": "fiber_g",
  "269": "sugars_g",
  "307": "sodium_mg",
  "601": "cholesterol_mg",
  "301": "calcium_mg",
  "303": "iron_mg",
  "306": "potassium_mg",
};

// Sugars is the one nutrient whose number differs by data type: SR Legacy
// reports "Total Sugars" under 269 (in the map above), but Foundation foods
// carry "Sugars, Total" under 269.3 instead. Verified on egg 748967 (269.3
// only) vs cumin 170923 (269 only). Without this every Foundation food would
// persist sugar-less.
const SUGARS_FALLBACK_NDB_NUMBER = "269.3";

/** Map an abridged payload's NDB-number-keyed nutrients onto the core label set. */
export function extractNutrition(detail: UsdaFoodDetail): IngredientNutrition {
  const amountByNumber = new Map<string, number>();
  for (const entry of detail.foodNutrients ?? []) {
    if (entry.number === undefined || typeof entry.amount !== "number") continue;
    if (!amountByNumber.has(entry.number)) {
      amountByNumber.set(entry.number, entry.amount);
    }
  }

  const nutrition: IngredientNutrition = {};
  for (const [number, field] of Object.entries(NUTRIENT_FIELD_BY_NDB_NUMBER)) {
    const amount = amountByNumber.get(number);
    if (amount !== undefined) nutrition[field] = amount;
  }

  // Foundation-food sugars fallback (see SUGARS_FALLBACK_NDB_NUMBER).
  if (nutrition.sugars_g === undefined) {
    const amount = amountByNumber.get(SUGARS_FALLBACK_NDB_NUMBER);
    if (amount !== undefined) nutrition.sugars_g = amount;
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
