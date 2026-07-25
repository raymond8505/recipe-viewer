import type { UsdaFoodDetail, UsdaSearchFood } from "@/lib/usda";
import type { UsdaFoodPortion } from "@/types/ingredient";

// Trimmed real USDA FoodData Central payloads — these lock in the shape quirks
// the client must handle: search nutrients are FLAT with `nutrientId`, and
// ABRIDGED detail nutrients are flat entries keyed by legacy NDB `number`
// (a string; Foundation uses dotted numbers like "269.3"), with the duplicate
// kJ "Energy" row under 268. Search payloads pulled 2026-07-14; abridged
// detail payloads pulled 2026-07-24 (the day the full format started 404ing
// Foundation records — see getFoodDetail).
//
// NOT exported from the @/fixtures barrel: only the usda/normalization tests
// need these; import directly from "@/fixtures/usda" (same convention as
// ./supabase and ./response).

export const cuminSearchResponse: {
  totalHits: number;
  foods: Array<UsdaSearchFood & { foodNutrients: unknown[] }>;
} = {
  totalHits: 372,
  foods: [
    {
      fdcId: 170923,
      description: "Spices, cumin seed",
      dataType: "SR Legacy",
      score: 787.51,
      // Flat search-shape nutrients — the client must NOT read these; it
      // trims search results to fdcId/description/dataType/score.
      foodNutrients: [
        {
          nutrientId: 1003,
          nutrientName: "Protein",
          unitName: "G",
          value: 17.8,
        },
      ],
    },
    {
      fdcId: 170145,
      description: "Seeds, breadfruit seeds, boiled",
      dataType: "SR Legacy",
      score: 400.02,
      foodNutrients: [],
    },
  ],
};

// Abridged detail payload for "Spices, cumin seed" (SR Legacy fdcId 170923).
// Real per-100g figures (abridged rounds to 3 significant digits). Includes:
// - the kJ "Energy" row (number 268) that must never win over 208 kcal
// - an unmapped nutrient (Magnesium 304) that must be ignored
// - sugars under 269 ("Total Sugars") — the SR Legacy number
export const cuminDetailResponse: UsdaFoodDetail = {
  fdcId: 170923,
  description: "Spices, cumin seed",
  dataType: "SR Legacy",
  foodNutrients: [
    { number: "208", name: "Energy", amount: 375, unitName: "KCAL" },
    { number: "268", name: "Energy", amount: 1570, unitName: "kJ" },
    { number: "203", name: "Protein", amount: 17.8, unitName: "G" },
    { number: "204", name: "Total lipid (fat)", amount: 22.3, unitName: "G" },
    {
      number: "606",
      name: "Fatty acids, total saturated",
      amount: 1.54,
      unitName: "G",
    },
    {
      number: "205",
      name: "Carbohydrate, by difference",
      amount: 44.2,
      unitName: "G",
    },
    { number: "291", name: "Fiber, total dietary", amount: 10.5, unitName: "G" },
    { number: "269", name: "Total Sugars", amount: 2.25, unitName: "G" },
    { number: "307", name: "Sodium, Na", amount: 168, unitName: "MG" },
    { number: "601", name: "Cholesterol", amount: 0, unitName: "MG" },
    { number: "301", name: "Calcium, Ca", amount: 931, unitName: "MG" },
    { number: "303", name: "Iron, Fe", amount: 66.4, unitName: "MG" },
    { number: "306", name: "Potassium, K", amount: 1790, unitName: "MG" },
    { number: "304", name: "Magnesium, Mg", amount: 366, unitName: "MG" },
  ],
};

// Abridged detail payload for "Eggs, Grade A, Large, egg whole" (Foundation
// fdcId 748967) — the record whose full-format 404 motivated the abridged
// switch. Locks in the Foundation quirks: sugars under 269.3 ("Sugars, Total",
// no 269 row) and calculated energy present under plain 208.
export const eggDetailResponse: UsdaFoodDetail = {
  fdcId: 748967,
  description: "Eggs, Grade A, Large, egg whole",
  dataType: "Foundation",
  foodNutrients: [
    { number: "208", name: "Energy", amount: 148, unitName: "KCAL" },
    { number: "268", name: "Energy", amount: 617, unitName: "kJ" },
    { number: "203", name: "Protein", amount: 12.4, unitName: "G" },
    { number: "204", name: "Total lipid (fat)", amount: 9.96, unitName: "G" },
    {
      number: "606",
      name: "Fatty acids, total saturated",
      amount: 3.2,
      unitName: "G",
    },
    {
      number: "205",
      name: "Carbohydrate, by difference",
      amount: 0.96,
      unitName: "G",
    },
    { number: "291", name: "Fiber, total dietary", amount: 0, unitName: "G" },
    { number: "269.3", name: "Sugars, Total", amount: 0.2, unitName: "G" },
    { number: "210", name: "Sucrose", amount: 0, unitName: "G" },
    { number: "211", name: "Glucose", amount: 0.2, unitName: "G" },
    { number: "307", name: "Sodium, Na", amount: 129, unitName: "MG" },
    { number: "601", name: "Cholesterol", amount: 411, unitName: "MG" },
    { number: "301", name: "Calcium, Ca", amount: 48, unitName: "MG" },
    { number: "303", name: "Iron, Fe", amount: 1.67, unitName: "MG" },
    { number: "306", name: "Potassium, K", amount: 132, unitName: "MG" },
  ],
};

// Real SR Legacy foodPortions for cumin (full-format only — abridged never
// returns portions). Kept for deriveDensity, whose UsdaFoodPortion handling is
// unchanged: unit text hides in `modifier` ("tsp, whole") with
// measureUnit.name "undetermined".
export const cuminFoodPortions: UsdaFoodPortion[] = [
  {
    gramWeight: 2.1,
    amount: 1.0,
    modifier: "tsp, whole",
    measureUnit: { name: "undetermined" },
  },
  {
    gramWeight: 6.0,
    amount: 1.0,
    modifier: "tbsp, whole",
    measureUnit: { name: "undetermined" },
  },
];

// The exact core-label-set extraction of cuminDetailResponse.
export const cuminExpectedNutrition = {
  calories_kcal: 375,
  protein_g: 17.8,
  fat_g: 22.3,
  saturated_fat_g: 1.54,
  carbs_g: 44.2,
  fiber_g: 10.5,
  sugars_g: 2.25,
  sodium_mg: 168,
  cholesterol_mg: 0,
  calcium_mg: 931,
  iron_mg: 66.4,
  potassium_mg: 1790,
};

// The exact core-label-set extraction of eggDetailResponse (sugars via the
// 269.3 Foundation fallback).
export const eggExpectedNutrition = {
  calories_kcal: 148,
  protein_g: 12.4,
  fat_g: 9.96,
  saturated_fat_g: 3.2,
  carbs_g: 0.96,
  fiber_g: 0,
  sugars_g: 0.2,
  sodium_mg: 129,
  cholesterol_mg: 411,
  calcium_mg: 48,
  iron_mg: 1.67,
  potassium_mg: 132,
};
