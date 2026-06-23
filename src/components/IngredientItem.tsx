"use client";

import { useState } from "react";
import type { ScaledIngredient } from "@/lib/ScalableRecipe";
import {
  convert,
  getUnitGroup,
  getUnitDisplay,
  formatParsedAmount,
  parseAmountToken,
  convertParsedAmount,
  isVolumeUnit,
  getDefaultVolumeUnit,
  closestCommonFraction,
  roundDecimal,
} from "@/lib/units";

interface IngredientItemProps {
  ingredient: ScaledIngredient;
  /**
   * Called when the user commits a new amount. The value is in the
   * ingredient's BASE unit — the unit on the schema, not the user's currently
   * selected display unit. ScalableRecipe.anchorIngredientAmount then derives
   * the recipe's new ingredient scale from this number.
   */
  onAnchor?: (amountInBaseUnit: number) => void;
}

export default function IngredientItem({ ingredient, onAnchor }: IngredientItemProps) {
  const { parsed, scaledAmount, unit, rest, original } = ingredient;
  // null = use the threshold-default unit. Non-null = user explicitly picked, sticky.
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  if (!parsed || !scaledAmount) {
    return <>{original}</>;
  }

  // Threshold-default unit for volumes is driven by the scaled ml value, but
  // only for single amounts. A range like "1-2 tsp" has a midpoint that can
  // straddle a threshold boundary (1.5 tsp ≈ 7.4 ml falls in the tbsp bucket),
  // promoting it to "0.3-0.7 tbsp" — worse UX than keeping "1-2 tsp". Ranges
  // therefore keep their source unit and the user can still override via the
  // dropdown.
  const thresholdUnit =
    isVolumeUnit(unit) && scaledAmount.kind === "single"
      ? getDefaultVolumeUnit(convert(scaledAmount.value, unit, "ml"))
      : unit;

  const displayUnit = selectedUnit ?? thresholdUnit;

  // formatAmount rounds to 2 dp, so format the unrounded converted amount
  // directly — pre-rounding here would re-introduce the ¼ → 0.3 precision loss.
  const convertedAmount = convertParsedAmount(scaledAmount, unit, displayUnit);
  const displayString = formatParsedAmount(convertedAmount);
  const unitGroup = getUnitGroup(unit);

  // Hint = closest common fraction in the threshold unit. Single-amount, volume only.
  // Suppressed when display unit == threshold unit and the rounded values agree.
  let hintLabel: string | null = null;
  if (scaledAmount.kind === "single" && isVolumeUnit(unit) && thresholdUnit) {
    const valueInHintUnit = convert(scaledAmount.value, unit, thresholdUnit);
    const hint = closestCommonFraction(valueInHintUnit, thresholdUnit);
    if (hint) {
      const redundant =
        displayUnit === thresholdUnit &&
        roundDecimal(valueInHintUnit) === roundDecimal(hint.value);
      if (!redundant) hintLabel = hint.label;
    }
  }

  function startEdit() {
    // For ranges, pre-fill with the midpoint as a single value — commitEdit
    // rejects range input, so showing "6-10" would silently no-op on Enter.
    const initial =
      convertedAmount.kind === "range"
        ? formatParsedAmount({
            kind: "single",
            value: (convertedAmount.min + convertedAmount.max) / 2,
          })
        : displayString;
    setEditValue(initial);
    setEditing(true);
  }

  function commitEdit() {
    const typed = parseAmountToken(editValue);
    // Reject ranges and invalid input — single-value anchor only.
    if (
      typed &&
      typed.kind === "single" &&
      Number.isFinite(typed.value) &&
      typed.value > 0 &&
      onAnchor
    ) {
      const inBaseUnit = convert(typed.value, displayUnit, unit);
      onAnchor(inBaseUnit);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <>
      {editing ? (
        <input
          type="text"
          inputMode="decimal"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="w-24 text-center border-b-2 border-orange-400 bg-transparent focus:outline-hidden"
          autoFocus
          tabIndex={0}
        />
      ) : onAnchor ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            startEdit();
          }}
          className="cursor-pointer underline underline-offset-2 decoration-orange-300 hover:decoration-orange-500"
          aria-label={rest ? `Edit amount for ${rest}` : `Edit amount: ${displayString}`}
        >
          {displayString}
        </button>
      ) : (
        <span>{displayString}</span>
      )}
      {unitGroup.length > 0 && displayUnit && (
        <>
          {" "}
          <select
            value={displayUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="bg-transparent appearance-none border-0 p-0 cursor-pointer underline underline-offset-2 decoration-orange-400 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-orange-400 rounded-sm"
            aria-label="unit"
          >
            {unitGroup.map((u) => (
              <option key={u} value={u}>
                {getUnitDisplay(u)}
              </option>
            ))}
          </select>
        </>
      )}
      {hintLabel && (
        <span className="ml-1 text-sm text-gray-400" aria-label={`approximately ${hintLabel}`}>
          (≈ {hintLabel})
        </span>
      )}
      {rest ? ` ${rest}` : ""}
    </>
  );
}
