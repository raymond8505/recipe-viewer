import type { UsdaFoodDetail, UsdaSearchFood } from "@/lib/usda";

// Trimmed real USDA FoodData Central payloads (pulled 2026-07-14 with
// DEMO_KEY) — these lock in the two shape quirks the client must handle:
// search nutrients are FLAT, detail nutrients are NESTED with optional
// `amount`, and SR Legacy portion units hide in `modifier`.
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
        { nutrientId: 1003, nutrientName: "Protein", unitName: "G", value: 17.8 },
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

// Detail payload for "Spices, cumin seed" (SR Legacy fdcId 170923). Nutrient
// values are the real per-100g figures. Includes:
// - a category-header row ("Proximates") with NO `amount` (must be skipped)
// - an unmapped nutrient (Magnesium 1090) that must be ignored
// - foodPortions whose unit text lives in `modifier` ("tsp, whole") with
//   measureUnit.name "undetermined"
export const cuminDetailResponse: UsdaFoodDetail = {
  fdcId: 170923,
  description: "Spices, cumin seed",
  dataType: "SR Legacy",
  foodNutrients: [
    { nutrient: { id: 2045, name: "Proximates", unitName: "g" } },
    { nutrient: { id: 1008, name: "Energy", unitName: "kcal" }, amount: 375.0 },
    { nutrient: { id: 1003, name: "Protein", unitName: "g" }, amount: 17.81 },
    { nutrient: { id: 1004, name: "Total lipid (fat)", unitName: "g" }, amount: 22.27 },
    { nutrient: { id: 1258, name: "Fatty acids, total saturated", unitName: "g" }, amount: 1.535 },
    { nutrient: { id: 1005, name: "Carbohydrate, by difference", unitName: "g" }, amount: 44.24 },
    { nutrient: { id: 1079, name: "Fiber, total dietary", unitName: "g" }, amount: 10.5 },
    { nutrient: { id: 2000, name: "Sugars, total including NLEA", unitName: "g" }, amount: 2.25 },
    { nutrient: { id: 1093, name: "Sodium, Na", unitName: "mg" }, amount: 168.0 },
    { nutrient: { id: 1253, name: "Cholesterol", unitName: "mg" }, amount: 0.0 },
    { nutrient: { id: 1087, name: "Calcium, Ca", unitName: "mg" }, amount: 931.0 },
    { nutrient: { id: 1089, name: "Iron, Fe", unitName: "mg" }, amount: 66.36 },
    { nutrient: { id: 1092, name: "Potassium, K", unitName: "mg" }, amount: 1788.0 },
    { nutrient: { id: 1090, name: "Magnesium, Mg", unitName: "mg" }, amount: 366.0 },
  ],
  foodPortions: [
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
  ],
};

// The exact core-label-set extraction of cuminDetailResponse.
export const cuminExpectedNutrition = {
  calories_kcal: 375.0,
  protein_g: 17.81,
  fat_g: 22.27,
  saturated_fat_g: 1.535,
  carbs_g: 44.24,
  fiber_g: 10.5,
  sugars_g: 2.25,
  sodium_mg: 168.0,
  cholesterol_mg: 0.0,
  calcium_mg: 931.0,
  iron_mg: 66.36,
  potassium_mg: 1788.0,
};
