"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import type { GroupEnabledState } from "@/hooks/useNutritionDetail";

/**
 * The heading band that opens an ingredient group in the NutritionDetail table.
 * Its checkbox is the batch action over the group's lines — a group is how
 * users think about a recipe's components ("skip the pasta, keep the sauce"),
 * so toggling one is the common case and toggling its lines individually is the
 * fallback. `some` renders indeterminate rather than guessing a direction.
 *
 * The heading cell freezes left (like the frozen body columns) so the group
 * name and its toggle stay visible during horizontal scroll.
 *
 * @summary group heading row with a tri-state batch toggle
 */
export default function NutritionGroupRow({
  heading,
  enabled,
  columnCount,
  onToggle,
}: {
  heading: string;
  enabled: GroupEnabledState;
  /** Total table columns, so the band spans the full width. */
  columnCount: number;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <TableRow className="bg-muted hover:bg-muted">
      <TableCell
        colSpan={2}
        className="sticky left-0 z-10 bg-muted font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground"
      >
        <span className="flex items-center gap-2">
          <Checkbox
            checked={enabled === "some" ? "indeterminate" : enabled === "all"}
            // "some" is a partial selection, so the click that resolves it
            // should complete the group rather than clear it.
            onCheckedChange={() => onToggle(enabled !== "all")}
            aria-label={`Include all ${heading} ingredients`}
          />
          {heading}
        </span>
      </TableCell>
      <TableCell colSpan={columnCount - 2} />
    </TableRow>
  );
}
