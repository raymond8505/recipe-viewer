"use client";

import { useMemo, useState } from "react";
import { getIngredientText, groupIngredientsWithIndex } from "@/lib/format";
import {
  lineComputationForSchema,
  perPortionNutrition,
  sumNutrition,
  type LineComputation,
} from "@/lib/nutritionMath";
import { parseServings } from "@/lib/units";
import {
  estimateIngredientGrams,
  setIngredientGrams,
  updateRecipeIngredientAssociation,
} from "@/lib/api/recipes";
import { importUsdaIngredient } from "@/lib/api/ingredients";
import type { UsdaSearchFood } from "@/lib/usda";
import type { QuantitativeValue, RecipeIngredient } from "@/types/recipe";
import type {
  IngredientKeywordMatch,
  IngredientNutrition,
  IngredientRow,
  RecipeIngredientRow,
} from "@/types/ingredient";

// Everything the math and display need from a catalog row — a keyword match
// carries exactly this much, so an association change can update the map
// without refetching the full IngredientRow.
export type CatalogIngredientSummary = Pick<
  IngredientRow,
  "id" | "name" | "nutrition" | "density_g_per_ml"
>;

export interface NutritionDetailLine {
  /** Original index into schemaIngredients — also recipe_ingredients.position. */
  index: number;
  /** The recipe's display text for this line (the source of truth). */
  text: string;
  row: RecipeIngredientRow | null;
  ingredient: CatalogIngredientSummary | null;
  computation: LineComputation;
}

export interface NutritionDetailGroup {
  heading: string | null;
  lines: NutritionDetailLine[];
}

// State + derived math for the NutritionDetail screen. Rows join to schema
// lines by position index; a line whose stored raw_text no longer equals the
// schema text is "stale" (the recipe was edited after the last normalization
// run) and is excluded from totals. Association changes are non-optimistic:
// await the PATCH, then update local state — totals recompute via useMemo.
export function useNutritionDetail(
  recipeId: string,
  schemaIngredients: Array<string | RecipeIngredient>,
  recipeYield: string | string[] | QuantitativeValue | undefined,
  initialRows: RecipeIngredientRow[],
  initialIngredients: IngredientRow[],
) {
  const [rows, setRows] = useState(initialRows);
  const [ingredientsById, setIngredientsById] = useState<
    Map<string, CatalogIngredientSummary>
  >(() => new Map(initialIngredients.map((ing) => [ing.id, ing])));
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo<NutritionDetailGroup[]>(() => {
    const rowsByPosition = new Map(rows.map((row) => [row.position, row]));
    return groupIngredientsWithIndex(schemaIngredients).map(
      ({ heading, items }) => ({
        heading,
        lines: items.map(({ ingredient: schemaIngredient, index }) => {
          const text = getIngredientText(schemaIngredient);
          const row = rowsByPosition.get(index) ?? null;
          // A stale line (no row, or text edited since normalization) shows no
          // match; lineComputationForSchema returns the matching "stale"
          // exclusion for it.
          const isStale = !row || row.raw_text !== text;
          const ingredient =
            !isStale && row?.ingredient_id
              ? (ingredientsById.get(row.ingredient_id) ?? null)
              : null;
          return {
            index,
            text,
            row,
            ingredient,
            computation: lineComputationForSchema(text, row, ingredient),
          };
        }),
      }),
    );
  }, [rows, ingredientsById, schemaIngredients]);

  const lines = useMemo(() => groups.flatMap((g) => g.lines), [groups]);

  const totals = useMemo<IngredientNutrition>(
    () =>
      sumNutrition(
        lines
          .map((l) => l.computation)
          .filter((c): c is Extract<LineComputation, { kind: "ok" }> => c.kind === "ok")
          .map((c) => c.nutrition),
      ),
    [lines],
  );

  const servings = useMemo(() => parseServings(recipeYield), [recipeYield]);
  const perPortion = useMemo(
    () => (servings != null && servings > 0 ? perPortionNutrition(totals, servings) : null),
    [totals, servings],
  );

  const excludedCount = lines.filter((l) => l.computation.kind === "excluded").length;
  const hasStaleLines = lines.some(
    (l) => l.computation.kind === "excluded" && l.computation.reason === "stale",
  );

  async function selectIngredient(
    rowId: string,
    match: IngredientKeywordMatch | null,
  ) {
    setSavingRowId(rowId);
    setError(null);
    try {
      const updated = await updateRecipeIngredientAssociation(
        recipeId,
        rowId,
        match?.id ?? null,
      );
      setRows((current) => current.map((r) => (r.id === rowId ? updated : r)));
      if (match) {
        setIngredientsById((current) =>
          new Map(current).set(match.id, {
            id: match.id,
            name: match.name,
            nutrition: match.nutrition,
            density_g_per_ml: match.density_g_per_ml,
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update match");
    } finally {
      setSavingRowId(null);
    }
  }

  // Resolve a user-picked USDA food to its catalog row, then associate the
  // line with it. The row is named by the USDA description; this line's parsed
  // name rides along as an alias server-side. One USDA food is one catalog row,
  // so picking a food someone already imported reuses it rather than creating a
  // rival — and the association call below is what teaches that row this
  // recipe's wording.
  async function importUsda(rowId: string, food: UsdaSearchFood) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    setSavingRowId(rowId);
    setError(null);
    try {
      const ingredient = await importUsdaIngredient(food.fdcId, row.name_text);
      const updated = await updateRecipeIngredientAssociation(
        recipeId,
        rowId,
        ingredient.id,
      );
      setRows((current) => current.map((r) => (r.id === rowId ? updated : r)));
      setIngredientsById((current) =>
        new Map(current).set(ingredient.id, {
          id: ingredient.id,
          name: ingredient.name,
          nutrition: ingredient.nutrition,
          density_g_per_ml: ingredient.density_g_per_ml,
        }),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to import from USDA",
      );
    } finally {
      setSavingRowId(null);
    }
  }

  // Run the LLM estimator for one line and store the result. The returned row
  // carries the new estimated_grams; totals recompute via useMemo.
  async function estimateGrams(rowId: string) {
    setSavingRowId(rowId);
    setError(null);
    try {
      const updated = await estimateIngredientGrams(recipeId, rowId);
      setRows((current) => current.map((r) => (r.id === rowId ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to estimate grams");
    } finally {
      setSavingRowId(null);
    }
  }

  // Set a user-typed gram value, or clear it (null → revert to derived).
  async function setGrams(rowId: string, grams: number | null) {
    setSavingRowId(rowId);
    setError(null);
    try {
      const updated = await setIngredientGrams(recipeId, rowId, grams);
      setRows((current) => current.map((r) => (r.id === rowId ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set grams");
    } finally {
      setSavingRowId(null);
    }
  }

  return {
    groups,
    totals,
    perPortion,
    servings,
    excludedCount,
    hasStaleLines,
    savingRowId,
    error,
    selectIngredient,
    importUsda,
    estimateGrams,
    setGrams,
  };
}
