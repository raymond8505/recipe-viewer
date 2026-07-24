import { generateEmbedding } from "./embedding";
import {
  IngredientRepoError,
  createIngredientRow,
  getIngredients,
  updateIngredientRow,
} from "./ingredients";
import { getFoodDetail, deriveDensity, extractNutrition } from "./usda";
import type { IngredientRow } from "@/types/ingredient";

// How importUsdaIngredient resolves a lower(name) collision with an existing
// catalog row:
// - "reuse" (default, automated normalization): a concurrent create won the
//   unique index — take theirs, never clobber a possibly-curated row from an
//   automated run.
// - "overwrite" (manual NutritionDetail import): the user deliberately picked
//   THIS USDA food, so it IS the ingredient they mean — update the same-name
//   row's values in place (one row per name). If they wanted the old one they
//   would have chosen it from the catalog list instead of reaching for USDA.
export type ImportConflictMode = "reuse" | "overwrite";

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
// lower(name) collision resolves per `onConflict` (above); UsdaError and
// unresolvable conflicts (no matching row found) propagate.
export async function importUsdaIngredient(
  name: string,
  fdcId: number,
  opts: { onConflict?: ImportConflictMode } = {},
): Promise<IngredientRow | null> {
  const detail = await getFoodDetail(fdcId);

  const embedding = await generateEmbedding(name);
  if (!embedding) return null;

  // The USDA-derived values, shared by the create and overwrite paths so a
  // brand-new row and an overwritten same-name row carry identical data. The
  // name (and thus the embedding) is unchanged on overwrite, so neither is
  // part of the patch.
  const usdaFields = {
    aliases: [detail.description],
    fdc_id: detail.fdcId,
    fdc_data_type: detail.dataType,
    nutrition: extractNutrition(detail),
    density_g_per_ml: deriveDensity(detail.foodPortions),
    food_portions: detail.foodPortions ?? null,
    source: "usda" as const,
  };

  try {
    return await createIngredientRow({ name, ...usdaFields, embedding });
  } catch (err) {
    if (err instanceof IngredientRepoError && err.kind === "conflict") {
      const { data } = await getIngredients({ query: name, limit: 10 });
      const existing = data.find(
        (i) => i.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        return opts.onConflict === "overwrite"
          ? await updateIngredientRow(existing.id, usdaFields)
          : existing;
      }
    }
    throw err;
  }
}
