"use client";

import { useState } from "react";
import {
  parseIngredient,
  convert,
  getUnitGroup,
  getUnitDisplay,
  formatAmount,
} from "@/lib/units";

interface IngredientItemProps {
  ingredient: string;
}

export default function IngredientItem({ ingredient }: IngredientItemProps) {
  const parsed = parseIngredient(ingredient);
  const [selectedUnit, setSelectedUnit] = useState(() => parsed?.unit ?? null);

  if (!parsed || !selectedUnit) {
    return <>{ingredient}</>;
  }

  const convertedAmount = convert(parsed.amount, parsed.unit, selectedUnit);
  const displayAmount = formatAmount(convertedAmount);
  const unitGroup = getUnitGroup(parsed.unit);

  return (
    <>
      <span>{displayAmount}</span>
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
      {parsed.rest ? ` ${parsed.rest}` : ""}
    </>
  );
}
