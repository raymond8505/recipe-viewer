"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { WarningIcon } from "@/components/icons";
import { normalizeRecipe } from "@/lib/api/recipes";
import { pluralize } from "@/lib/format";
import { useNutritionDetail } from "@/hooks/useNutritionDetail";
import type { QuantitativeValue, RecipeIngredient } from "@/types/recipe";
import type { IngredientRow, RecipeIngredientRow } from "@/types/ingredient";
import type {
  IngredientAutocompleteSearch,
  UsdaFoodSearch,
} from "@/hooks/useIngredientAutocomplete";
import NutritionDetailRow from "./NutritionDetailRow";
import NutritionGroupRow from "./NutritionGroupRow";
import NutritionSummaryRow from "./NutritionSummaryRow";
import { NUTRITION_DETAIL_COLUMNS, nutritionLabel } from "./nutritionColumns";
import { STICKY_ALIASES_HEAD, STICKY_HEAD, STICKY_NAME_HEAD } from "./tableStyles";

// Recipe text + autocomplete are the frozen columns; the 12 nutrition
// columns scroll.
const COLUMN_COUNT = NUTRITION_DETAIL_COLUMNS.length + 2;

interface NutritionDetailProps {
  recipeId: string;
  schemaIngredients: Array<string | RecipeIngredient>;
  recipeYield: string | string[] | QuantitativeValue | undefined;
  initialRows: RecipeIngredientRow[];
  initialIngredients: IngredientRow[];
  /** DI seam for the autocomplete so stories/tests run without a backend. */
  search?: IngredientAutocompleteSearch;
  /** DI seam for the autocomplete's USDA fallback search. */
  usdaSearch?: UsdaFoodSearch;
}

/**
 * Nutrition breakdown of a recipe's normalized ingredient lines, grouped like
 * the recipe display. Each row shows the line's contribution (per-100g catalog
 * nutrition scaled by the parsed amount converted to grams). Editable cells:
 * the recipe line text (edits the recipe schema itself — a deterministic
 * re-parse, never a re-match) and the normalized-ingredient autocomplete, which
 * persists the association and recomputes the row + totals. Table chrome
 * (frozen columns, sticky header, capped scroll box) mirrors IngredientsTable.
 *
 * Re-matching is only ever something the CURATOR asks for: the autocomplete,
 * the Estimate action, or the Normalize button. Rewording a line is not a
 * claim about which food it is, so it changes nothing but the words.
 *
 * Every line and every group also carries an include toggle, so the totals can
 * answer "what are the macros if I skip this component of the recipe?". Those
 * toggles are session-only and never leave this screen.
 *
 * @summary per-line nutrition table with manual match curation and what-if toggles
 */
export default function NutritionDetail({
  recipeId,
  schemaIngredients,
  recipeYield,
  initialRows,
  initialIngredients,
  search,
  usdaSearch,
}: NutritionDetailProps) {
  const router = useRouter();
  const [normalizeState, setNormalizeState] = useState<"idle" | "queueing" | "queued">(
    "idle",
  );
  const {
    groups,
    totals,
    perPortion,
    servings,
    excludedCount,
    hasStaleLines,
    disabledCount,
    savingRowId,
    savingLineIndex,
    error,
    selectIngredient,
    importUsda,
    updateLineText,
    estimateGrams,
    setGrams,
    toggleLine,
    setLinesEnabled,
    enableAll,
  } = useNutritionDetail(
    recipeId,
    schemaIngredients,
    recipeYield,
    initialRows,
    initialIngredients,
  );

  async function handleRenormalize() {
    setNormalizeState("queueing");
    try {
      await normalizeRecipe(recipeId);
      setNormalizeState("queued");
    } catch {
      setNormalizeState("idle");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hasStaleLines ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <WarningIcon />
            Some lines have never been normalized and are excluded from totals —
            normalize to build their rows.
          </p>
        ) : (
          <span />
        )}
        {normalizeState === "queued" ? (
          // A 200 from the normalize route means "queued", not "done" — the
          // run happens post-response, so refreshing is the way to see it.
          <Button size="sm" variant="secondary" onClick={() => router.refresh()}>
            Queued — check again
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={normalizeState === "queueing"}
            onClick={handleRenormalize}
            title="Re-parses and re-matches every line; manual matches are preserved"
          >
            Normalize
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Same single scroll box as IngredientsTable: header sticks to the top,
          the recipe-text and normalized-ingredient columns stick to the left,
          and the shadcn Table's own overflow wrapper is neutralized so it
          can't become the scrollport. */}
      <div className="max-h-[73vh] overflow-auto [&_[data-slot=table-container]]:overflow-visible">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={STICKY_NAME_HEAD}>Ingredient</TableHead>
              <TableHead className={STICKY_ALIASES_HEAD}>Normalized</TableHead>
              {NUTRITION_DETAIL_COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  className={`${STICKY_HEAD} text-right whitespace-nowrap`}
                >
                  {nutritionLabel(col)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.every((g) => g.lines.length === 0) ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-8 text-center text-muted-foreground"
                >
                  No ingredients on this recipe.
                </TableCell>
              </TableRow>
            ) : (
              groups.map((group, gi) => (
                <Fragment key={group.heading ?? `ungrouped-${gi}`}>
                  {group.heading != null && (
                    <NutritionGroupRow
                      heading={group.heading}
                      enabled={group.enabled}
                      columnCount={COLUMN_COUNT}
                      onToggle={(enabled) =>
                        setLinesEnabled(
                          group.lines.map((l) => l.index),
                          enabled,
                        )
                      }
                    />
                  )}
                  {group.lines.map((line) => (
                    <NutritionDetailRow
                      key={line.index}
                      line={line}
                      saving={
                        (savingRowId != null && savingRowId === line.row?.id) ||
                        savingLineIndex === line.index
                      }
                      search={search}
                      usdaSearch={usdaSearch}
                      onSelect={selectIngredient}
                      onImportUsda={importUsda}
                      onEditText={updateLineText}
                      onEstimateGrams={estimateGrams}
                      onSetGrams={setGrams}
                      onToggle={toggleLine}
                    />
                  ))}
                </Fragment>
              ))
            )}
            <NutritionSummaryRow label="Recipe total" nutrition={totals} />
            <NutritionSummaryRow
              label={servings != null ? `Per portion (÷${servings})` : "Per portion"}
              nutrition={perPortion}
              missingTitle="Servings unknown — recipeYield has no number"
            />
          </TableBody>
        </Table>
      </div>

      {excludedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Totals exclude {excludedCount} flagged{" "}
          {pluralize(excludedCount, "line")} — hover a{" "}
          <WarningIcon className="inline-block size-3.5 align-text-bottom text-amber-500" />{" "}
          flag for the reason.
        </p>
      )}

      {/* The only batch control the table needs beyond group toggles: a way
          back to the unfiltered recipe. A "select all" header checkbox would
          otherwise duplicate it. */}
      {disabledCount > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {disabledCount} {pluralize(disabledCount, "ingredient")} switched off —
          totals reflect the rest.
          <Button size="sm" variant="ghost" onClick={enableAll}>
            Enable all
          </Button>
        </p>
      )}
    </div>
  );
}
