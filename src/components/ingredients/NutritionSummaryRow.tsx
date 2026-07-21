"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { formatAmount } from "@/lib/units";
import type { IngredientNutrition } from "@/types/ingredient";
import { NUTRITION_COLUMNS } from "./nutritionColumns";
import { STICKY_ALIASES_CELL, STICKY_NAME_CELL } from "./tableStyles";

/**
 * A pinned aggregate row at the bottom of the NutritionDetail table ("Recipe
 * total" / "Per portion"). `nutrition: null` renders all-dashes with
 * `missingTitle` explaining why (e.g. servings unknown).
 *
 * @summary totals row for the nutrition breakdown table
 */
export default function NutritionSummaryRow({
  label,
  grams,
  nutrition,
  missingTitle,
}: {
  label: string;
  grams: number | null;
  nutrition: IngredientNutrition | null;
  missingTitle?: string;
}) {
  return (
    <TableRow className="border-t-2 bg-muted/50 font-medium hover:bg-muted/50">
      <TableCell
        className={STICKY_NAME_CELL}
        title={nutrition == null ? missingTitle : undefined}
      >
        {label}
      </TableCell>
      <TableCell className={STICKY_ALIASES_CELL} />
      <TableCell className="text-right tabular-nums">
        {nutrition != null && grams != null ? formatAmount(grams) : "—"}
      </TableCell>
      {NUTRITION_COLUMNS.map((col) => {
        const value = nutrition?.[col.key];
        return (
          <TableCell key={col.key} className="text-right tabular-nums">
            {value != null ? formatAmount(value) : "—"}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
