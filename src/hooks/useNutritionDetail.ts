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
  /** Counted in the totals. Switched off by the user, not by the data. */
  enabled: boolean;
}

/** Tri-state for a group's toggle: every line on, every line off, or a mix. */
export type GroupEnabledState = "all" | "none" | "some";

export interface NutritionDetailGroup {
  heading: string | null;
  lines: NutritionDetailLine[];
  enabled: GroupEnabledState;
}

// State + derived math for the NutritionDetail screen. Rows join to schema
// lines by position index; a line whose stored raw_text no longer equals the
// schema text is "stale" (the recipe was edited after the last normalization
// run) and is excluded from totals. Association changes are non-optimistic:
// await the PATCH, then update local state — totals recompute via useMemo.
//
// The per-line enable/disable toggles are a what-if lens ("what are the macros
// if I skip the pasta?"), deliberately session-only: nothing persists, and
// nothing leaves this screen. The recipe page's NutritionPanel, the JSON-LD,
// and MCP get_recipe all keep resolving through ScalableRecipe.nutrition().
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
  // Keyed by schema position — the same index that joins schema lines to
  // recipe_ingredients rows. Stable for the page's lifetime: schemaIngredients
  // is a server prop, and every mutation below replaces entries in `rows`
  // rather than reordering them.
  const [disabledIndexes, setDisabledIndexes] = useState<Set<number>>(
    () => new Set(),
  );

  const groups = useMemo<NutritionDetailGroup[]>(() => {
    const rowsByPosition = new Map(rows.map((row) => [row.position, row]));
    return groupIngredientsWithIndex(schemaIngredients).map(
      ({ heading, items }) => {
        const lines = items.map(({ ingredient: schemaIngredient, index }) => {
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
            enabled: !disabledIndexes.has(index),
          };
        });
        const enabledCount = lines.filter((l) => l.enabled).length;
        return {
          heading,
          lines,
          enabled:
            enabledCount === lines.length
              ? "all"
              : enabledCount === 0
                ? "none"
                : "some",
        };
      },
    );
  }, [rows, ingredientsById, schemaIngredients, disabledIndexes]);

  const lines = useMemo(() => groups.flatMap((g) => g.lines), [groups]);
  const enabledLines = useMemo(() => lines.filter((l) => l.enabled), [lines]);

  const totals = useMemo<IngredientNutrition>(
    () =>
      sumNutrition(
        enabledLines
          .map((l) => l.computation)
          .filter((c): c is Extract<LineComputation, { kind: "ok" }> => c.kind === "ok")
          .map((c) => c.nutrition),
      ),
    [enabledLines],
  );

  const servings = useMemo(() => parseServings(recipeYield), [recipeYield]);
  const perPortion = useMemo(
    () => (servings != null && servings > 0 ? perPortionNutrition(totals, servings) : null),
    [totals, servings],
  );

  // Both warnings are scoped to enabled lines: they exist to flag contributions
  // *silently* missing from the tally, and a line the user switched off is not
  // silent. Counting those would make the flag count climb on every toggle.
  const excludedCount = enabledLines.filter(
    (l) => l.computation.kind === "excluded",
  ).length;
  const hasStaleLines = enabledLines.some(
    (l) => l.computation.kind === "excluded" && l.computation.reason === "stale",
  );
  const disabledCount = lines.length - enabledLines.length;

  function toggleLine(index: number) {
    setDisabledIndexes((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  }

  /** Batch action behind a group's checkbox. */
  function setLinesEnabled(indexes: number[], enabled: boolean) {
    setDisabledIndexes((current) => {
      const next = new Set(current);
      for (const index of indexes) {
        if (enabled) next.delete(index);
        else next.add(index);
      }
      return next;
    });
  }

  function enableAll() {
    setDisabledIndexes(new Set());
  }

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

  // Mint a catalog row from a user-picked USDA food, then associate the line
  // with it. Canonical name = the line's PARSED name (recipe language, e.g.
  // "gochujang"), per the normalization convention — the USDA description
  // lands as an alias server-side. Re-picking a different food for a line
  // whose name is already cataloged forks a NEW row (named by the USDA
  // description), so this association lands on whatever row the API returns.
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
    disabledCount,
    savingRowId,
    error,
    selectIngredient,
    importUsda,
    estimateGrams,
    setGrams,
    toggleLine,
    setLinesEnabled,
    enableAll,
  };
}
