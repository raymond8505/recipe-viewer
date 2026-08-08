import { generateEmbedding } from "./embedding";
import { ingredientEmbeddingText } from "./ingredientAliases";
import {
  IngredientRepoError,
  createIngredientRow,
  getIngredientByFdcId,
} from "./ingredients";
import { getFoodDetail, deriveDensity, extractNutrition } from "./usda";
import { estimateDensity } from "./normalization/estimateDensity";
import type { IngredientRow } from "@/types/ingredient";

// Find — or create — the one catalog ingredient for a USDA food. Shared by the
// normalization workflow (an LLM picks the fdcId) and the NutritionDetail
// manual import (the user picks it), so the two paths can never diverge on how
// a USDA food becomes a catalog row.
//
// `fdcId` is the identity: one USDA food is one catalog row, forever
// (db/migrations/0011). The canonical name is USDA's `description`, and
// `nameText` — the recipe line's parsed, quantity-stripped name — rides along
// as an alias. That direction matters: naming rows in recipe language made the
// SAME food reachable under many names, so "cilantro", "coriander" and
// "reserved cilantro and mint" each minted their own duplicate of fdc 169997.
// Recipe language belongs in `aliases`, which match_ingredients (0007) and
// search_ingredients_keyword (0008) already score best-of over.
//
// Idempotent: a second call for the same fdcId returns the existing row without
// spending USDA budget (1,000 req/hr) or minting a duplicate.
//
// This function performs no alias MUTATION — it only seeds `aliases` in the
// initial insert. Both callers re-point a recipe line immediately afterwards,
// and that path accretes; see src/__tests__/ingredient-alias-call-sites.test.ts.
//
// Returns null when no embedding could be generated (the column is NOT NULL,
// db/migrations/0006) — callers surface that as retryable. UsdaError propagates.
export async function importUsdaIngredient(
  nameText: string,
  fdcId: number,
): Promise<IngredientRow | null> {
  // Before the USDA round trip: this food may already be cataloged under a
  // name nobody would have guessed from `nameText`.
  const existing = await getIngredientByFdcId(fdcId);
  if (existing) return existing;

  const detail = await getFoodDetail(fdcId);

  const aliases = sameFold(nameText, detail.description) ? [] : [nameText];

  const embedding = await generateEmbedding(
    ingredientEmbeddingText(detail.description, aliases),
  );
  if (!embedding) return null;

  // USDA portions first (real measured data), LLM estimate second — the
  // abridged detail format never carries foodPortions, so without the
  // estimate every import would land density-less and push volume lines onto
  // per-line gram estimates. Best-effort: a declined estimate leaves null.
  // The estimator gets `nameText` because its prompt reasons in recipe
  // language ("chopped fresh herbs ~0.1"), not USDA's.
  const density =
    deriveDensity(detail.foodPortions) ??
    (await estimateDensity({ name: nameText, usdaDescription: detail.description }));

  const usdaFields = {
    fdc_id: detail.fdcId,
    fdc_data_type: detail.dataType,
    nutrition: extractNutrition(detail),
    density_g_per_ml: density,
    food_portions: detail.foodPortions ?? null,
    source: "usda" as const,
  };

  try {
    return await createIngredientRow({
      name: detail.description,
      aliases,
      ...usdaFields,
      embedding,
    });
  } catch (err) {
    if (!(err instanceof IngredientRepoError) || err.kind !== "conflict") {
      throw err;
    }

    // Two indexes can raise this. Check the fdc_id one first: a concurrent
    // import won the race for this exact food, so take the winner's row rather
    // than minting a rival for the same USDA record.
    const winner = await getIngredientByFdcId(detail.fdcId);
    if (winner) return winner;

    // Otherwise a DIFFERENT food already owns lower(description) — FDC does
    // reuse a description across data types. Disambiguate with the record id
    // rather than failing the import outright, since the user has no recourse
    // from a 500. The embedding is deliberately reused: the suffix is
    // bookkeeping noise, so the description-derived vector is the better one.
    return await createIngredientRow({
      name: `${detail.description} (FDC ${detail.fdcId})`,
      aliases,
      ...usdaFields,
      embedding,
    });
  }
}

function sameFold(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
