"use client";

import { useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
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

// A line the user switched off. Deliberately applied to cell *contents* rather
// than the <tr>: opacity on the row would create a stacking context, re-rooting
// the frozen columns' z-10 inside it and letting a faded row's sticky cells
// paint wrong against their neighbours (see tableStyles.ts for the z-order).
const OFF_CLASS = "opacity-60 line-through";

/**
 * One recipe line in the NutritionDetail table: a toggle plus the frozen recipe
 * text (with an exclusion flag when the line can't contribute to totals), the
 * frozen normalized-ingredient autocomplete, then read-only nutrition cells.
 *
 * Switching the toggle off drops the line from the totals but keeps its numbers
 * on screen, struck through — the point of the lens is seeing what you removed.
 *
 * @summary read-only nutrition row with an include toggle and an editable match cell
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
  onToggle,
}: {
  line: NutritionDetailLine;
  saving: boolean;
  search?: IngredientAutocompleteSearch;
  usdaSearch?: UsdaFoodSearch;
  onSelect: (rowId: string, match: IngredientKeywordMatch | null) => void;
  onImportUsda: (rowId: string, food: UsdaSearchFood) => void;
  onEstimateGrams: (rowId: string) => void;
  onSetGrams: (rowId: string, grams: number | null) => void;
  onToggle: (index: number) => void;
}) {
  const { row, ingredient, computation, enabled } = line;
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
          {/* Rides inside the existing frozen cell rather than taking a column
              of its own — a new leading column would break the w-44/left-44
              contract the two frozen columns share (tableStyles.ts). */}
          <Checkbox
            checked={enabled}
            onCheckedChange={() => onToggle(line.index)}
            aria-label={`Include ${line.text}`}
            className="mt-0.5 self-start"
          />
          {/* Wrap (same treatment as the matched-ingredient label) — the
              column is fixed-width (w-44), so long lines must grow the row,
              not truncate. break-words keeps unbroken tokens from widening
              the frozen column and breaking the left-44 offset. */}
          <span
            className={cn("min-w-0 text-wrap break-words", !enabled && OFF_CLASS)}
          >
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
          // Recedes with the rest of the row, but no strikethrough — the match
          // and grams stay editable while the line is switched off.
          <span
            className={cn(
              "flex w-full min-w-0 flex-col gap-1",
              !enabled && "opacity-60",
            )}
          >
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
          <TableCell
            key={col.key}
            className={cn("text-right tabular-nums", !enabled && OFF_CLASS)}
          >
            {value != null ? formatAmount(value) : "—"}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
