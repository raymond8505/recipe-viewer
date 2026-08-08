"use client";

import { useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { EditIcon, SpinnerIcon, WarningIcon } from "@/components/icons";
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
  stale: "No normalized row for this line — run normalization",
};

/**
 * One recipe line in the NutritionDetail table: the recipe text (editable in
 * place — this edits the recipe schema itself, with an exclusion flag when
 * the line can't contribute to totals), the frozen normalized-ingredient
 * autocomplete, then read-only nutrition cells.
 *
 * Editing the text does not re-match the line. The autocomplete is where the
 * association changes, and it is the only thing here that changes it.
 *
 * @summary nutrition row with editable line text and match cells
 */
export default function NutritionDetailRow({
  line,
  saving,
  search,
  usdaSearch,
  onSelect,
  onImportUsda,
  onEditText,
  onEstimateGrams,
  onSetGrams,
}: {
  line: NutritionDetailLine;
  saving: boolean;
  search?: IngredientAutocompleteSearch;
  usdaSearch?: UsdaFoodSearch;
  onSelect: (rowId: string, match: IngredientKeywordMatch | null) => void;
  onImportUsda: (rowId: string, food: UsdaSearchFood) => void;
  onEditText: (index: number, text: string) => void;
  onEstimateGrams: (rowId: string) => void;
  onSetGrams: (rowId: string, grams: number | null) => void;
}) {
  const { row, ingredient, computation } = line;
  const excluded = computation.kind === "excluded";
  // Grams only matter for a matched line. "stale" now means the line has no row
  // of its own — either none at all, or a legacy positional one about to be
  // rebuilt — so there is nothing to edit a weight on either way. A reworded
  // line is NOT stale: its row followed the edit and keeps its grams.
  const isStale =
    computation.kind === "excluded" && computation.reason === "stale";
  const showGrams = row != null && row.ingredient_id != null && !isStale;
  // The sticky cell is its own stacking context (z-10), so the dropdown's
  // internal z-index can't beat sibling rows' sticky cells — the whole cell
  // is raised above them (but below the z-30 header corners) while open.
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  // Inline edit buffer for the recipe line text; null = not editing. Commit
  // on Enter/blur, cancel on Escape — same idioms as NutritionGramsCell.
  const [draft, setDraft] = useState<string | null>(null);

  function commitDraft() {
    if (draft == null) return;
    const trimmed = draft.trim();
    setDraft(null);
    // An empty or unchanged commit is a cancel, not a save.
    if (trimmed !== "" && trimmed !== line.text) onEditText(line.index, trimmed);
  }

  return (
    <TableRow className="group">
      <TableCell
        className={cn(STICKY_NAME_CELL, excluded && "text-muted-foreground")}
      >
        {draft != null ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") setDraft(null);
            }}
            autoFocus
            disabled={saving}
            aria-label={`Edit line ${line.text}`}
            className="w-full rounded-none border-0 border-b border-border bg-transparent outline-hidden focus:border-orange-400 disabled:opacity-50"
          />
        ) : (
          <span className="flex w-full min-w-0 items-center gap-1.5">
            {/* Wrap (same treatment as the matched-ingredient label) — the
                column is fixed-width (w-44), so long lines must grow the row,
                not truncate. break-words keeps unbroken tokens from widening
                the frozen column and breaking the left-44 offset. */}
            <span className="min-w-0 text-wrap break-words">{line.text}</span>
            {excluded && (
              <span title={EXCLUSION_TITLES[computation.reason]}>
                <WarningIcon className="size-4 shrink-0 text-amber-500" />
              </span>
            )}
            <button
              type="button"
              onClick={() => setDraft(line.text)}
              disabled={saving}
              aria-label={`Edit ${line.text}`}
              title="Edit this recipe line — the matched ingredient is kept"
              className="shrink-0 text-muted-foreground hover:text-brand disabled:opacity-50 [&_svg]:size-3.5"
            >
              <EditIcon />
            </button>
          </span>
        )}
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
