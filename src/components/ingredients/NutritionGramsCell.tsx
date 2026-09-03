"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/units";
import type { LineComputation } from "@/lib/nutritionMath";
import type { RecipeIngredientRow } from "@/types/ingredient";

/**
 * The editable per-line grams control under the Normalized cell. Shows the
 * weight the line resolves to and lets a curator either type an override or
 * click "Estimate" to have the LLM fill it (the rescue for volume-with-no-
 * density and count/can lines). A stored estimate wins over the derived value
 * — clearing the field reverts to the derived weight.
 *
 * The field is the local edit buffer; it re-syncs whenever the persisted
 * `estimated_grams` changes (save round-trip or re-estimate). Empty commits as
 * a clear (null); a negative/garbage entry is rejected back to the stored value.
 *
 * A typed 0 is accepted and means "don't count this line" — the escape hatch
 * for an ingredient that can't reasonably be weighed ("salt to taste"), which
 * would otherwise sit un-estimable and hold the whole recipe off its
 * ingredient-derived total. It marks as "not counted" rather than "est.":
 * both are stored estimates, but 0 is a decision about the line, not a guess
 * at its weight.
 *
 * @summary editable grams override + LLM estimate trigger for one line
 */
export default function NutritionGramsCell({
  row,
  computation,
  saving,
  label,
  onEstimate,
  onSetGrams,
}: {
  row: RecipeIngredientRow;
  computation: LineComputation;
  saving: boolean;
  /** The line's display text, for distinct per-row aria-labels. */
  label: string;
  onEstimate: (rowId: string) => void;
  onSetGrams: (rowId: string, grams: number | null) => void;
}) {
  const stored = row.estimated_grams;
  const [value, setValue] = useState(stored != null ? String(stored) : "");
  useEffect(() => {
    setValue(stored != null ? String(stored) : "");
  }, [stored]);

  // The weight the line would resolve to WITHOUT an override — shown as the
  // placeholder so a curator sees the derived value before typing.
  const derived =
    computation.kind === "ok" && computation.gramsSource !== "estimated"
      ? computation.grams
      : null;
  // Keyed on the stored value, not grams_source: an LLM-returned 0 says the
  // same thing a user-typed one does, and "not counted" describes it better
  // than "est." either way.
  const notCounted = stored === 0;
  const isEstimated =
    !notCounted &&
    computation.kind === "ok" &&
    computation.gramsSource === "estimated";

  function commit() {
    const trimmed = value.trim();
    if (trimmed === "") {
      if (stored != null) onSetGrams(row.id, null);
      return;
    }
    const parsed = Number(trimmed);
    // 0 is a legitimate entry ("don't count this line"), so only negatives and
    // garbage bounce back to the stored value.
    if (!Number.isFinite(parsed) || parsed < 0) {
      setValue(stored != null ? String(stored) : "");
      return;
    }
    if (parsed !== stored) onSetGrams(row.id, parsed);
  }

  return (
    // flex-wrap is load-bearing, not tidying: the cell sits in a hard-capped
    // w-44 frozen column (tableStyles.ts), and the "not counted" pill is wide
    // enough that field + unit + pill + "Estimate" no longer fit on one line.
    // Without wrapping, "Estimate" overflows and widens the column past w-44,
    // which breaks the NEXT frozen column's matching left-44 offset.
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        disabled={saving}
        aria-label={`Grams for ${label}`}
        placeholder={derived != null ? formatAmount(derived) : "g"}
        className="w-14 rounded-none border-0 border-b border-border bg-transparent text-right tabular-nums outline-hidden focus:border-orange-400 disabled:opacity-50"
      />
      <span aria-hidden="true">g</span>
      {/* Marker + action travel together as one wrappable unit. `basis-full`
          only when the wide "not counted" pill is showing: that's the case
          where the four items can't share a line, and letting the pill break
          on its own would strand "Estimate" alone on the next row, which reads
          as a layout bug rather than a second line. Every other state (bare
          field, or the narrow "est." pill) still fits on one line, so the
          table's row height is unchanged there. */}
      <span className={cn("flex items-center gap-1.5")}>
        {isEstimated && (
          <span
            className="rounded-full bg-brand-subtle px-1.5 py-0.5 text-[10px] font-medium text-brand"
            title="Estimated weight — not a measured density conversion"
          >
            est.
          </span>
        )}

        <button
          type="button"
          onClick={() => onEstimate(row.id)}
          disabled={saving}
          className="text-brand hover:underline disabled:opacity-50"
          aria-label={`Estimate grams for ${label}`}
        >
          Estimate
        </button>
        {notCounted && (
          <span
            className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground"
            title="Set to 0 — this line deliberately contributes nothing to the totals"
          >
            not counted
          </span>
        )}
      </span>
    </span>
  );
}
