"use client";

import { useEffect, useState } from "react";
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
 * a clear (null); a non-positive/garbage entry is rejected back to the stored
 * value.
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
  const isEstimated =
    computation.kind === "ok" && computation.gramsSource === "estimated";

  function commit() {
    const trimmed = value.trim();
    if (trimmed === "") {
      if (stored != null) onSetGrams(row.id, null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setValue(stored != null ? String(stored) : "");
      return;
    }
    if (parsed !== stored) onSetGrams(row.id, parsed);
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
    </span>
  );
}
