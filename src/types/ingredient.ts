// Per-100g nutrition. Inferred from the zod schema that declares the nutrients
// (@/lib/schemas/nutrition) rather than restated here, so the validator and the
// type cannot describe different foods. Re-exported from this module because
// this is where the rest of the ingredient types live; the import is type-only,
// so nothing pulls zod into a bundle by reading it.
export type { IngredientNutrition } from "@/lib/schemas/nutrition";
import type { IngredientNutrition } from "@/lib/schemas/nutrition";

export type IngredientSource = "usda" | "manual";

export type MatchStatus = "matched" | "novel" | "unmatched" | "manual";

// Provenance of a line's estimated_grams (the display marker keys off this; the
// nutrition math keys off estimated_grams presence alone). "llm" = the
// normalization graph or the NutritionDetail "Estimate" button; "manual" = a
// user-typed value in the grams field.
export type GramsSource = "llm" | "manual";

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

// One line of a recipe's ingredient list. Since db/migrations/0016 this row IS
// the line: `raw_text` is the recipe's ingredient text, and
// `recipes.ingredients` orders these rows by id. Normalization fills in the
// catalog association; it never rewrites the text.
export interface RecipeIngredientRow {
  /**
   * The line's identity. `recipes.ingredients` holds these, so text and order
   * move freely underneath it — which is what keeps a curated association
   * attached across a reword or a reorder.
   */
  id: string;
  recipe_id: string;
  /**
   * DEAD — always null on rows written since db/migrations/0016.
   *
   * 0013 introduced it as a synthetic id mirrored onto each schema line, back
   * when the ingredient list lived in `metadata.schema` and a derived row had
   * nothing better to key on. 0016 pointed `recipes.ingredients` straight at
   * `id` instead, which made this redundant. Kept only as an artifact of the
   * old shape; nothing reads or writes it.
   */
  line_id: string | null;
  ingredient_id: string | null;
  raw_text: string;
  quantity: number | null;
  // A UNIT_DEFS key (src/lib/units.ts) or null for count/unitless lines.
  unit: string | null;
  name_text: string;
  note: string | null;
  match_status: MatchStatus;
  confidence: number | null;
  /**
   * DEAD — takes the column default (0) on rows written since
   * db/migrations/0016, which made a line's position its index in
   * `recipes.ingredients`. 0017 dropped the `unique (recipe_id, position)`
   * constraint that 0014 had to defer just so a reorder could land. Kept only
   * as an artifact of the old shape; nothing reads or writes it.
   */
  position: number;
  // A resolved gram weight (db/migrations/0009) that rescues lines the density
  // path can't convert — volume-with-no-density, or count/can lines. Internal
  // to NutritionDetail; never feeds recipe text or JSON-LD. Presence overrides
  // the density-derived value in nutritionMath. null = none.
  estimated_grams: number | null;
  // Provenance of estimated_grams; null exactly when estimated_grams is null.
  grams_source: GramsSource | null;
}

// A match_ingredients RPC result row (hybrid keyword + semantic search,
// db/migrations/0007; aliases added in 0012).
export interface IngredientMatch {
  id: string;
  // USDA's description for a sourced row ("Butter, without salt").
  name: string;
  // The recipe-language names this row answers to ("unsalted butter"). Since
  // `name` is USDA wording, these are usually what actually identifies a row
  // as the caller's ingredient — and they're what keyword_similarity scores
  // against, so returning them keeps that number explicable.
  aliases: string[];
  nutrition: IngredientNutrition | null;
  density_g_per_ml: number | null;
  // Raw cosine similarity of the query embedding (1 - cosine distance).
  semantic_similarity: number;
  // Best pg_trgm trigram similarity of the query text across name + aliases;
  // ~1.0 means a near-exact name or alias match.
  keyword_similarity: number;
  // Reciprocal-rank-fusion score of the two signals. Ranking only — not a
  // similarity, so never threshold on it; threshold on the raw similarities.
  score: number;
}

// A search_ingredients_keyword RPC result row (keyword-only trigram search,
// db/migrations/0008) — the NutritionDetail autocomplete path. Unlike
// IngredientMatch there is no embedding involved, so `similarity` is a raw
// trigram score and IS safe to threshold or display.
export interface IngredientKeywordMatch {
  id: string;
  name: string;
  aliases: string[];
  nutrition: IngredientNutrition | null;
  density_g_per_ml: number | null;
  // Best pg_trgm trigram similarity of the query text across name + aliases;
  // ~1.0 means a near-exact name or alias match.
  similarity: number;
}

export interface IngredientsResult {
  data: IngredientRow[];
  count: number;
}
