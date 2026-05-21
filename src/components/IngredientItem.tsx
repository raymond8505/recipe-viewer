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
  roundParsedAmount,
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
  const [selectedUnit, setSelectedUnit] = useState<string | null>(unit);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  if (!parsed || !scaledAmount) {
    return <>{original}</>;
  }

  const displayedAmount = roundParsedAmount(
    convertParsedAmount(scaledAmount, unit, selectedUnit),
  );
  const displayString = formatParsedAmount(displayedAmount);
  const unitGroup = getUnitGroup(unit);

  function startEdit() {
    setEditValue(displayString);
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
      const inBaseUnit = convert(typed.value, selectedUnit, unit);
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
          className="w-24 text-center border-b-2 border-orange-400 bg-transparent focus:outline-none"
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
      {unitGroup.length > 0 && selectedUnit && (
        <>
          {" "}
          <select
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="bg-transparent appearance-none border-0 p-0 cursor-pointer underline underline-offset-2 decoration-orange-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded"
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
      {rest ? ` ${rest}` : ""}
    </>
  );
}
