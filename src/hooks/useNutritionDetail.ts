"use client";

import { useMemo, useState } from "react";
import {
  computeLineNutrition,
  perPortionNutrition,
  sumNutrition,
  type LineComputation,
} from "@/lib/nutritionMath";
import { flattenIngredients, toRecipeIngredient } from "@/lib/recipeIngredients";
import { parseServings } from "@/lib/units";
import {
  estimateIngredientGrams,
  setIngredientGrams,
  updateRecipeIngredientAssociation,
  updateRecipeIngredientLine,
} from "@/lib/api/recipes";
import { importUsdaIngredient } from "@/lib/api/ingredients";
import type { UsdaSearchFood } from "@/lib/usda";
import type {
  QuantitativeValue,
  RecipeIngredient,
  RecipeIngredientGroup,
} from "@/types/recipe";
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
  /** The ingredient's id — the row's, and what every action here addresses. */
  id: string;
  /** The recipe's text for this line (the source of truth). */
  text: string;
  row: RecipeIngredient;
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

/** The catalog rows the groups carry, keyed by id, as the overlay's seed. */
function catalogFromGroups(
  groups: readonly RecipeIngredientGroup[],
): Map<string, CatalogIngredientSummary> {
  const map = new Map<string, CatalogIngredientSummary>();
  for (const line of flattenIngredients(groups)) {
    if (line.ingredient) map.set(line.ingredient.id, line.ingredient);
  }
  return map;
}

// State + derived math for the NutritionDetail screen. The recipe's ingredient
// groups are the state; every line IS its recipe_ingredients row, so there is
// no join. Association changes are non-optimistic: await the PATCH, then
// update local state — totals recompute via useMemo.
//
// The per-line enable/disable toggles are a what-if lens ("what are the macros
// if I skip the pasta?"), deliberately session-only: nothing persists, and
// nothing leaves this screen. The recipe page's NutritionPanel, the JSON-LD,
// and MCP get_recipe all keep resolving through ScalableRecipe.nutrition().
export function useNutritionDetail(
  recipeId: string,
  initialIngredients: RecipeIngredientGroup[],
  recipeYield: string | string[] | QuantitativeValue | undefined,
) {
  const [groupsState, setGroups] = useState(initialIngredients);
  // Catalog rows by id, layered over what the groups carry: an association
  // change brings its own summary (from the keyword match or the USDA import),
  // so the line can render its new name without a refetch.
  const [catalogById, setCatalogById] = useState<Map<string, CatalogIngredientSummary>>(
    () => catalogFromGroups(initialIngredients),
  );
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Keyed by the line's id, which is stable across every edit this screen can
  // make — a reword keeps the row — so a switched-off line can't silently
  // change identity under the user mid-edit.
  const [disabledIds, setDisabledIds] = useState<Set<string>>(() => new Set());

  const groups = useMemo<NutritionDetailGroup[]>(
    () =>
      groupsState.map((group) => {
        const lines = group.ingredients.map((row): NutritionDetailLine => {
          // The association is a fact about the row, resolved purely from
          // ingredient_id — the same lookup computeRecipeNutrition makes.
          const ingredient = row.ingredient_id
            ? (catalogById.get(row.ingredient_id) ?? null)
            : null;
          return {
            id: row.id,
            text: row.raw_text,
            row,
            ingredient,
            computation: computeLineNutrition(row, ingredient),
            enabled: !disabledIds.has(row.id),
          };
        });
        const enabledCount = lines.filter((l) => l.enabled).length;
        return {
          heading: group.name ?? null,
          lines,
          enabled:
            enabledCount === lines.length
              ? "all"
              : enabledCount === 0
                ? "none"
                : "some",
        };
      }),
    [groupsState, catalogById, disabledIds],
  );

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

  // Scoped to enabled lines: the warning exists to flag contributions
  // *silently* missing from the tally, and a line the user switched off is not
  // silent. Counting those would make the flag count climb on every toggle.
  const excludedCount = enabledLines.filter(
    (l) => l.computation.kind === "excluded",
  ).length;
  const disabledCount = lines.length - enabledLines.length;

  function toggleLine(id: string) {
    setDisabledIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Batch action behind a group's checkbox. */
  function setLinesEnabled(ids: string[], enabled: boolean) {
    setDisabledIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (enabled) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function enableAll() {
    setDisabledIds(new Set());
  }

  /** Swap one line for the row the server returned, in place. */
  function replaceRow(row: RecipeIngredientRow) {
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        ingredients: group.ingredients.map((line) =>
          line.id === row.id ? { ...line, ...toRecipeIngredient(row) } : line,
        ),
      })),
    );
  }

  async function selectIngredient(
    rowId: string,
    match: IngredientKeywordMatch | null,
  ) {
    setSavingRowId(rowId);
    setError(null);
    try {
      replaceRow(
        await updateRecipeIngredientAssociation(recipeId, rowId, match?.id ?? null),
      );
      if (match) {
        setCatalogById((current) =>
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
    const row = lines.find((l) => l.id === rowId)?.row;
    if (!row) return;
    setSavingRowId(rowId);
    setError(null);
    try {
      const ingredient = await importUsdaIngredient(food.fdcId, row.name_text);
      replaceRow(await updateRecipeIngredientAssociation(recipeId, rowId, ingredient.id));
      setCatalogById((current) =>
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

  // Save an edited line's text into the recipe. Non-optimistic like the other
  // mutations: await the PATCH, then swap in the server's groups, whose row
  // for this line already carries the deterministic re-parse. A reword doesn't
  // re-match — the line keeps the ingredient it was curated onto — so it keeps
  // contributing to the totals right through the edit.
  async function updateLineText(id: string, text: string): Promise<void> {
    setSavingRowId(id);
    setError(null);
    try {
      const updated = await updateRecipeIngredientLine(recipeId, id, text);
      setGroups(updated.ingredients);
      setCatalogById((current) => new Map([...current, ...catalogFromGroups(updated.ingredients)]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update line");
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
      replaceRow(await estimateIngredientGrams(recipeId, rowId));
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
      replaceRow(await setIngredientGrams(recipeId, rowId, grams));
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
    disabledCount,
    savingRowId,
    error,
    selectIngredient,
    importUsda,
    updateLineText,
    estimateGrams,
    setGrams,
    toggleLine,
    setLinesEnabled,
    enableAll,
  };
}
