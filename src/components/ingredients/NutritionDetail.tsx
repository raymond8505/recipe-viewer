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
import type { IngredientAutocompleteSearch } from "@/hooks/useIngredientAutocomplete";
import NutritionDetailRow from "./NutritionDetailRow";
import NutritionSummaryRow from "./NutritionSummaryRow";
import { NUTRITION_COLUMNS } from "./nutritionColumns";
import { STICKY_ALIASES_HEAD, STICKY_HEAD, STICKY_NAME_HEAD } from "./tableStyles";

// Recipe text + autocomplete are the frozen columns; grams + the 12 nutrition
// columns scroll. 2 frozen + grams + 12 = 15.
const COLUMN_COUNT = NUTRITION_COLUMNS.length + 3;

interface NutritionDetailProps {
  recipeId: string;
  schemaIngredients: Array<string | RecipeIngredient>;
  recipeYield: string | string[] | QuantitativeValue | undefined;
  initialRows: RecipeIngredientRow[];
  initialIngredients: IngredientRow[];
  /** DI seam for the autocomplete so stories/tests run without a backend. */
  search?: IngredientAutocompleteSearch;
}

/**
 * Nutrition breakdown of a recipe's normalized ingredient lines, grouped like
 * the recipe display. Each row shows the line's contribution (per-100g catalog
 * nutrition scaled by the parsed amount converted to grams); the only editable
 * cell is the normalized-ingredient autocomplete, which persists the
 * association and recomputes the row + totals. Table chrome (frozen columns,
 * sticky header, capped scroll box) mirrors IngredientsTable.
 *
 * @summary per-line nutrition table with manual match curation
 */
export default function NutritionDetail({
  recipeId,
  schemaIngredients,
  recipeYield,
  initialRows,
  initialIngredients,
  search,
}: NutritionDetailProps) {
  const router = useRouter();
  const [normalizeState, setNormalizeState] = useState<"idle" | "queueing" | "queued">(
    "idle",
  );
  const {
    groups,
    totals,
    totalGrams,
    perPortion,
    servings,
    excludedCount,
    hasStaleLines,
    savingRowId,
    error,
    selectIngredient,
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
      {hasStaleLines && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <WarningIcon />
          <span className="flex-1">
            Some lines changed since the last normalization run and are excluded
            from totals. Re-running rebuilds every line and discards manual
            matches.
          </span>
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
            >
              Re-run normalization
            </Button>
          )}
        </div>
      )}

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
              <TableHead title="Computed grams" className={`${STICKY_HEAD} text-right`}>
                g
              </TableHead>
              {NUTRITION_COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  title={col.title}
                  className={`${STICKY_HEAD} text-right`}
                >
                  {col.label}
                  {col.unit && (
                    <span className="ml-0.5 font-normal text-muted-foreground">
                      ({col.unit})
                    </span>
                  )}
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
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={COLUMN_COUNT}
                        className="pt-4 font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                      >
                        {group.heading}
                      </TableCell>
                    </TableRow>
                  )}
                  {group.lines.map((line) => (
                    <NutritionDetailRow
                      key={line.index}
                      line={line}
                      saving={savingRowId != null && savingRowId === line.row?.id}
                      search={search}
                      onSelect={selectIngredient}
                    />
                  ))}
                </Fragment>
              ))
            )}
            <NutritionSummaryRow
              label="Recipe total"
              grams={totalGrams}
              nutrition={totals}
            />
            <NutritionSummaryRow
              label={servings != null ? `Per portion (÷${servings})` : "Per portion"}
              grams={servings != null && servings > 0 ? totalGrams / servings : null}
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
    </div>
  );
}
