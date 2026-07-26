import { generateEmbedding } from "./embedding";
import {
  IngredientRepoError,
  createIngredientRow,
  getIngredientByFdcId,
  getIngredients,
} from "./ingredients";
import { getFoodDetail, deriveDensity, extractNutrition } from "./usda";
import { estimateDensity } from "./normalization/estimateDensity";
import type { IngredientRow } from "@/types/ingredient";

// How importUsdaIngredient resolves a lower(name) collision with an existing
// catalog row:
// - "reuse" (default, automated normalization): a concurrent create won the
//   unique index — take theirs, never clobber a possibly-curated row from an
//   automated run.
// - "fork" (manual NutritionDetail import): the user deliberately picked THIS
//   USDA food for one recipe line. If the same-name row is already that food
//   (same fdc_id, anywhere in the catalog) it's reused; otherwise a NEW row is
//   created, named by the USDA description with the recipe-language name as an
//   alias. The same-name row is never updated in place: it may be referenced
//   by other recipes' lines (overwriting would silently swap their nutrition),
//   and a re-pick is usually a correction — both foods must remain available.
export type ImportConflictMode = "reuse" | "fork";

// Create one catalog ingredient from a chosen USDA food — shared by the
// normalization workflow (LLM picks the fdcId) and the NutritionDetail manual
// import (the user picks it), so the two paths can never diverge on how a
// USDA food becomes a catalog row.
//
// The catalog's canonical name is the RECIPE-language name ("gochujang"), not
// USDA's description — future matching embeds recipe language, so the catalog
// should speak it. The USDA description is kept as an alias for provenance.
// (A "fork" collision row inverts this: description as name, recipe-language
// name as alias — the recipe-language name is already taken.)
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

  // USDA portions first (real measured data), LLM estimate second — the
  // abridged detail format never carries foodPortions, so without the
  // estimate every import would land density-less and push volume lines onto
  // per-line gram estimates. Best-effort: a declined estimate leaves null.
  const density =
    deriveDensity(detail.foodPortions) ??
    (await estimateDensity({ name, usdaDescription: detail.description }));

  // The USDA-derived values, shared by the create and fork paths so a
  // brand-new row and a forked collision row carry identical data.
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
      name,
      aliases: [detail.description],
      ...usdaFields,
      embedding,
    });
  } catch (err) {
    if (!(err instanceof IngredientRepoError) || err.kind !== "conflict") {
      throw err;
    }

    if (opts.onConflict === "fork") {
      // The picked food may already be in the catalog under another name
      // (including "the user re-picked the same food") — reuse that row
      // instead of minting a duplicate for the same USDA record.
      const sameFood = await getIngredientByFdcId(detail.fdcId);
      if (sameFood) return sameFood;

      // Different food behind the taken name → fork a new row named by the
      // USDA description; the recipe-language name rides along as an alias so
      // keyword/semantic matching can still surface it. The embedding embeds
      // the row's actual name, same rule as the primary path.
      const forkEmbedding = await generateEmbedding(detail.description);
      if (!forkEmbedding) return null;

      // The description itself can collide (e.g. the same description across
      // USDA data types) — one retry with the fdcId spelled out; a collision
      // beyond that propagates.
      for (const forkName of [
        detail.description,
        `${detail.description} (USDA ${detail.fdcId})`,
      ]) {
        try {
          return await createIngredientRow({
            name: forkName,
            aliases: [name],
            ...usdaFields,
            embedding: forkEmbedding,
          });
        } catch (forkErr) {
          if (
            !(forkErr instanceof IngredientRepoError) ||
            forkErr.kind !== "conflict"
          ) {
            throw forkErr;
          }
        }
      }
      throw err;
    }

    const { data } = await getIngredients({ query: name, limit: 10 });
    const existing = data.find(
      (i) => i.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing;
    throw err;
  }
}
