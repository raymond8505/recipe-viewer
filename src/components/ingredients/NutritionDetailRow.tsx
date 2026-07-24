"use client";

import { useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { SpinnerIcon, WarningIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/units";
import type { NutritionDetailLine } from "@/hooks/useNutritionDetail";
import type { ExclusionReason } from "@/lib/nutritionMath";
import type { IngredientKeywordMatch } from "@/types/ingredient";
import type { UsdaSearchFood } from "@/lib/usda";
import type {
  IngredientAutocompleteSearch,
  UsdaFoodSearch,
} from "@/hooks/useIngredientAutocomplete";
import IngredientAutocomplete from "./IngredientAutocomplete";
import NutritionGramsCell from "./NutritionGramsCell";
import { NUTRITION_DETAIL_COLUMNS } from "./nutritionColumns";
import { STICKY_ALIASES_CELL, STICKY_NAME_CELL } from "./tableStyles";

const EXCLUSION_TITLES: Record<ExclusionReason, string> = {
  unmatched: "Not matched to the catalog — pick an ingredient to include it",
  no_nutrition: "Matched ingredient has no nutrition data",
  no_quantity: "No parsed amount — can't convert to grams",
  no_unit: "No unit (count line) — can't convert to grams",
  no_density: "Volume unit but the ingredient has no density",
  stale: "Line changed since normalization — re-run normalization",
};

/**
 * One recipe line in the NutritionDetail table: frozen recipe text (with an
 * exclusion flag when the line can't contribute to totals), the frozen
 * normalized-ingredient autocomplete, then read-only nutrition cells.
 *
 * @summary read-only nutrition row with an editable match cell
 */
export default function NutritionDetailRow({
  line,
  saving,
  search,
  usdaSearch,
  onSelect,
  onImportUsda,
  onEstimateGrams,
  onSetGrams,
}: {
  line: NutritionDetailLine;
  saving: boolean;
  search?: IngredientAutocompleteSearch;
  usdaSearch?: UsdaFoodSearch;
  onSelect: (rowId: string, match: IngredientKeywordMatch | null) => void;
  onImportUsda: (rowId: string, food: UsdaSearchFood) => void;
  onEstimateGrams: (rowId: string) => void;
  onSetGrams: (rowId: string, grams: number | null) => void;
}) {
  const { row, ingredient, computation } = line;
  const excluded = computation.kind === "excluded";
  // Grams only matter for a matched line, and a stale line's row is about to be
  // rebuilt — hide the editor in both cases.
  const isStale =
    computation.kind === "excluded" && computation.reason === "stale";
  const showGrams = row != null && row.ingredient_id != null && !isStale;
  // The sticky cell is its own stacking context (z-10), so the dropdown's
  // internal z-index can't beat sibling rows' sticky cells — the whole cell
  // is raised above them (but below the z-30 header corners) while open.
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);

  return (
    <TableRow className="group">
      <TableCell
        className={cn(STICKY_NAME_CELL, excluded && "text-muted-foreground")}
      >
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate" title={line.text}>
            {line.text}
          </span>
          {excluded && (
            <span title={EXCLUSION_TITLES[computation.reason]}>
              <WarningIcon className="size-4 shrink-0 text-amber-500" />
            </span>
          )}
        </span>
      </TableCell>
      <TableCell
        className={cn(STICKY_ALIASES_CELL, autocompleteOpen && "z-20")}
      >
        {row ? (
          <span className="flex w-full min-w-0 flex-col gap-1">
            <span className="flex w-full min-w-0 items-center gap-1.5">
              <span className="min-w-0 flex-1 text-wrap">
                <IngredientAutocomplete
                  value={
                    row.ingredient_id
                      ? {
                          id: row.ingredient_id,
                          name: ingredient?.name ?? "(unknown ingredient)",
                        }
                      : null
                  }
                  onSelect={(match) => onSelect(row.id, match)}
                  onImportUsda={(food) => onImportUsda(row.id, food)}
                  ariaLabel={`Change match for ${line.text}`}
                  disabled={saving}
                  search={search}
                  usdaSearch={usdaSearch}
                  onOpenChange={setAutocompleteOpen}
                />
              </span>
              {saving && <SpinnerIcon />}
            </span>
            {showGrams && (
              <NutritionGramsCell
                row={row}
                computation={computation}
                saving={saving}
                label={line.text}
                onEstimate={onEstimateGrams}
                onSetGrams={onSetGrams}
              />
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      {NUTRITION_DETAIL_COLUMNS.map((col) => {
        const value =
          computation.kind === "ok"
            ? computation.nutrition[col.key]
            : undefined;
        return (
          <TableCell key={col.key} className="text-right tabular-nums">
            {value != null ? formatAmount(value) : "—"}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
