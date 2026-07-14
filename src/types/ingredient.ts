// Per-100g nutrition, the "core label set" subset of a USDA FoodData Central
// food (decided against real FDC payloads, 2026-07). Keys are the stable JSONB
// wire format for ingredients.nutrition — the USDA nutrient id each field maps
// to lives in src/lib/usda.ts. All fields optional: USDA coverage varies per
// food, and manual entries may fill in only what's known.
export interface IngredientNutrition {
  calories_kcal?: number;
  protein_g?: number;
  fat_g?: number;
  saturated_fat_g?: number;
  carbs_g?: number;
  fiber_g?: number;
  sugars_g?: number;
  sodium_mg?: number;
  cholesterol_mg?: number;
  calcium_mg?: number;
  iron_mg?: number;
  potassium_mg?: number;
}

export type IngredientSource = "usda" | "manual";

export type MatchStatus = "matched" | "novel" | "unmatched" | "manual";

export type NormalizationStatus = "pending" | "running" | "completed" | "failed";

// A USDA foodPortion entry, kept verbatim on the ingredient row for audit and
// manual density correction. SR Legacy foods put the household-measure text in
// `modifier` (e.g. "tsp, whole") with measureUnit.name "undetermined";
// Foundation foods may populate measureUnit.name instead.
export interface UsdaFoodPortion {
  gramWeight: number;
  amount?: number;
  modifier?: string;
  measureUnit?: { name?: string };
}

// The `embedding` column is intentionally absent: it's write-only (queried via
// the match_ingredients RPC), mirroring recipes.embedding.
export interface IngredientRow {
  id: string;
  name: string;
  aliases: string[];
  fdc_id: number | null;
  fdc_data_type: string | null;
  nutrition: IngredientNutrition | null;
  density_g_per_ml: number | null;
  food_portions: UsdaFoodPortion[] | null;
  source: IngredientSource;
  created_at: string;
  updated_at: string;
}

// One parsed line of a recipe's ingredient list — the structured layer derived
// from SchemaRecipe.recipeIngredient. The schema text stays the display source
// of truth; these rows never feed back into it.
export interface RecipeIngredientRow {
  id: string;
  recipe_id: string;
  ingredient_id: string | null;
  raw_text: string;
  quantity: number | null;
  // A UNIT_DEFS key (src/lib/units.ts) or null for count/unitless lines.
  unit: string | null;
  name_text: string;
  note: string | null;
  match_status: MatchStatus;
  confidence: number | null;
  position: number;
}

// A match_ingredients RPC result row. similarity = 1 - cosine distance.
export interface IngredientMatch {
  id: string;
  name: string;
  nutrition: IngredientNutrition | null;
  density_g_per_ml: number | null;
  similarity: number;
}

export interface IngredientsResult {
  data: IngredientRow[];
  count: number;
}
