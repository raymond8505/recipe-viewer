"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { formatAmount } from "@/lib/units";
import type { IngredientNutrition } from "@/types/ingredient";
import { NUTRITION_DETAIL_COLUMNS } from "./nutritionColumns";
import { FOOTER_ALIASES_CELL, FOOTER_CELL, FOOTER_NAME_CELL } from "./tableStyles";

/**
 * An aggregate row in the NutritionDetail table's pinned footer ("Recipe
 * total" / "Per portion"). `nutrition: null` renders all-dashes with
 * `missingTitle` explaining why (e.g. servings unknown).
 *
 * Belongs in a `<TableFooter>`, which owns the band's tint and pins it. The row
 * drops the primitive's bottom border and translucent hover, both of which
 * would open a gap onto the rows scrolling under the pinned band — a collapsed
 * table border is painted by the `<table>`, which does not travel with the
 * sticky footer, so it arrives there as a 1px transparent line.
 *
 * @summary totals row for the nutrition breakdown table
 */
export default function NutritionSummaryRow({
  label,
  nutrition,
  missingTitle,
}: {
  label: string;
  nutrition: IngredientNutrition | null;
  missingTitle?: string;
}) {
  return (
    <TableRow className="border-b-0 hover:bg-transparent">
      <TableCell
        className={FOOTER_NAME_CELL}
        title={nutrition == null ? missingTitle : undefined}
      >
        {label}
      </TableCell>
      <TableCell className={FOOTER_ALIASES_CELL} />
      {NUTRITION_DETAIL_COLUMNS.map((col) => {
        const value = nutrition?.[col.key];
        return (
          <TableCell key={col.key} className={FOOTER_CELL}>
            {value != null ? formatAmount(value) : "—"}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
