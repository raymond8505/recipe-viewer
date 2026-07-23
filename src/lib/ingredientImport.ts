import { generateEmbedding } from "./embedding";
import {
  IngredientRepoError,
  createIngredientRow,
  getIngredients,
} from "./ingredients";
import { getFoodDetail, deriveDensity, extractNutrition } from "./usda";
import type { IngredientRow } from "@/types/ingredient";

// Create one catalog ingredient from a chosen USDA food — shared by the
// normalization workflow (LLM picks the fdcId) and the NutritionDetail manual
// import (the user picks it), so the two paths can never diverge on how a
// USDA food becomes a catalog row.
//
// The catalog's canonical name is the RECIPE-language name ("gochujang"), not
// USDA's description — future matching embeds recipe language, so the catalog
// should speak it. The USDA description is kept as an alias for provenance.
//
// Returns null when no embedding could be generated (the column is NOT NULL,
// db/migrations/0006) — callers surface that as a retryable condition. A
// lower(name) unique-index race resolves to the existing row; UsdaError and
// unresolved conflicts propagate.
export async function importUsdaIngredient(
  name: string,
  fdcId: number,
): Promise<IngredientRow | null> {
  const detail = await getFoodDetail(fdcId);

  const embedding = await generateEmbedding(name);
  if (!embedding) return null;

  try {
    return await createIngredientRow({
      name,
      aliases: [detail.description],
      fdc_id: detail.fdcId,
      fdc_data_type: detail.dataType,
      nutrition: extractNutrition(detail),
      density_g_per_ml: deriveDensity(detail.foodPortions),
      food_portions: detail.foodPortions ?? null,
      source: "usda",
      embedding,
    });
  } catch (err) {
    if (err instanceof IngredientRepoError && err.kind === "conflict") {
      // A concurrent create won the lower(name) unique index — use theirs.
      const { data } = await getIngredients({ query: name, limit: 10 });
      const existing = data.find(
        (i) => i.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) return existing;
    }
    throw err;
  }
}
