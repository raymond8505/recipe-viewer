"use client";

import { useState } from "react";
import Link from "next/link";
import { TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  EditIcon,
  ExternalLinkIcon,
  SpinnerIcon,
  WarningIcon,
} from "@/components/icons";
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

// The three grams-less reasons all share one set of fixes, so they share one
// tail — and it names entering 0 explicitly, because that is the only way out
// for a line nobody can weigh ("salt to taste") and an empty numeric field is
// not a discoverable place to learn it. `unmatched`, `no_nutrition` and `stale`
// are fixed elsewhere (the autocomplete, the catalog, normalization), so they
// must NOT offer it.
const GRAMS_FIXES =
  "Type a weight, use Estimate, or enter 0 to count this line as nothing.";

const EXCLUSION_TITLES: Record<ExclusionReason, string> = {
  unmatched: "Not matched to the catalog — pick an ingredient to include it",
  no_nutrition: "Matched ingredient has no nutrition data",
  no_quantity: `No parsed amount — can't convert to grams. ${GRAMS_FIXES}`,
  no_unit: `No unit (count line) — can't convert to grams. ${GRAMS_FIXES}`,
  no_density: `Volume unit but the ingredient has no density. ${GRAMS_FIXES}`,
  stale: "No normalized row for this line — run normalization",
};

// A line the user switched off. Deliberately applied to cell *contents* rather
// than the <tr>: opacity on the row would create a stacking context, re-rooting
// the frozen columns' z-10 inside it and letting a faded row's sticky cells
// paint wrong against their neighbours (see tableStyles.ts for the z-order).
const OFF_CLASS = "opacity-60 line-through";

/**
 * One recipe line in the NutritionDetail table: an include toggle plus the
 * frozen recipe text (editable in place — this edits the recipe schema itself,
 * with an exclusion flag when the line can't contribute to totals), the frozen
 * normalized-ingredient autocomplete, then read-only nutrition cells.
 *
 * Switching the toggle off drops the line from the totals but keeps its numbers
 * on screen, struck through — the point of the lens is seeing what you removed.
 *
 * Editing the text does not re-match the line. The autocomplete is where the
 * association changes, and it is the only thing here that changes it.
 *
 * @summary nutrition row with an include toggle, editable line text, and a match cell
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
  onToggle,
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
  onToggle: (index: number) => void;
}) {
  const { row, ingredient, computation, enabled } = line;
  const excluded = computation.kind === "excluded";
  // Grams only matter for a matched line. "stale" means the line has no row of
  // its own (since db/migrations/0016 a line's id IS its row, so that is the
  // only way to be stale), and there is nothing to edit a weight on. A reworded
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
        <span className="flex w-full min-w-0 items-center gap-1.5">
          {/* Rides inside the existing frozen cell rather than taking a column
              of its own — a new leading column would break the w-44/left-44
              contract the two frozen columns share (tableStyles.ts). Sits
              outside the edit branch below: the toggle stays live mid-edit,
              for the same reason the match cell does on a switched-off line. */}
          <Checkbox
            checked={enabled}
            onCheckedChange={() => onToggle(line.index)}
            aria-label={`Include ${line.text}`}
            className="mt-0.5 self-start"
          />
          {draft != null ? (
            // No OFF_CLASS here even when the line is switched off — a
            // struck-through field you are actively typing in reads as broken.
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
              className="min-w-0 flex-1 rounded-none border-0 border-b border-border bg-transparent outline-hidden focus:border-orange-400 disabled:opacity-50"
            />
          ) : (
            <>
              {/* Wrap (same treatment as the matched-ingredient label) — the
                  column is fixed-width (w-44), so long lines must grow the row,
                  not truncate. break-words keeps unbroken tokens from widening
                  the frozen column and breaking the left-44 offset. */}
              <span
                className={cn(
                  "min-w-0 flex-1 text-wrap break-words",
                  !enabled && OFF_CLASS,
                )}
              >
                {line.text}
              </span>
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
            </>
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
              {/* Gated on the resolved catalog row, not on row.ingredient_id:
                  when the id doesn't resolve the label above reads "(unknown
                  ingredient)" and there is no name to search the manager with.
                  New tab on purpose — this page's include-toggle lens and any
                  in-flight edits are session state worth keeping. */}
              {ingredient && (
                <Link
                  href={`/ingredients?q=${encodeURIComponent(ingredient.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Edit ${ingredient.name} in the ingredient manager`}
                  title="Edit this ingredient in the ingredient manager"
                  className="shrink-0 text-muted-foreground hover:text-brand [&_svg]:size-3.5"
                >
                  <ExternalLinkIcon />
                </Link>
              )}
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
