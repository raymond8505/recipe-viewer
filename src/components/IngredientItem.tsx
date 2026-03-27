"use client";

import { useState } from "react";
import {
  parseIngredient,
  convert,
  getUnitGroup,
  getUnitDisplay,
  formatAmount,
  roundToQuarter,
} from "@/lib/units";

interface IngredientItemProps {
  ingredient: string;
  scale?: number;
  onScaleChange?: (newScale: number) => void;
}

export default function IngredientItem({
  ingredient,
  scale = 1,
  onScaleChange,
}: IngredientItemProps) {
  const parsed = parseIngredient(ingredient);
  const [selectedUnit, setSelectedUnit] = useState(() => parsed?.unit ?? null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  if (!parsed) {
    return <>{ingredient}</>;
  }

  const convertedAmount = roundToQuarter(convert(parsed.amount * scale, parsed.unit, selectedUnit));
  const displayAmount = formatAmount(convertedAmount);
  const unitGroup = getUnitGroup(parsed.unit);

  function startEdit() {
    setEditValue(String(convertedAmount));
    setEditing(true);
  }

  function commitEdit() {
    const newVal = parseFloat(editValue);
    if (!isNaN(newVal) && newVal > 0 && onScaleChange) {
      const baseAmount = convert(parsed!.amount, parsed!.unit, selectedUnit!);
      if (baseAmount > 0) {
        onScaleChange(newVal / baseAmount);
      }
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
          type="number"
          min="0"
          step="any"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="w-16 text-center border-b-2 border-orange-400 bg-transparent focus:outline-none"
          autoFocus
          tabIndex={0}
        />
      ) : (
        <span
          onClick={onScaleChange ? (e) => { e.stopPropagation(); startEdit(); } : undefined}
          onKeyDown={onScaleChange ? (e) => { if (e.key === "Enter" || e.key === " ") startEdit(); } : undefined}
          role={onScaleChange ? "button" : undefined}
          aria-label={onScaleChange ? `Edit amount: ${displayAmount}` : undefined}
          tabIndex={onScaleChange ? 0 : undefined}
          className={
            onScaleChange
              ? "cursor-pointer underline underline-offset-2 decoration-orange-300 hover:decoration-orange-500"
              : undefined
          }
        >
          {displayAmount}
        </span>
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
      {parsed.rest ? ` ${parsed.rest}` : ""}
    </>
  );
}
