"use client";

import { useId } from "react";
import type { ScaledIngredient } from "@/lib/ScalableRecipe";
import IngredientItem from "@/components/IngredientItem";
import { cn } from "@/lib/utils";

interface IngredientListItemProps {
  ingredient: ScaledIngredient;
  /** Whether the line is on the shopping list. */
  selected: boolean;
  onToggle: () => void;
  /** Makes the amount editable (see `IngredientItem`); omit it for a read-only amount. */
  onAnchor?: (amountInBaseUnit: number) => void;
  /** Merged last onto the row. The row sets no text size of its own — the caller picks one. */
  className?: string;
}

/**
 * One ingredient line as a shopping-list checkbox. The dot *is* the checkbox, and
 * the label covers the row, so tapping anywhere toggles it — while `IngredientItem`'s
 * amount button and unit select stay real controls beside the label, reachable by
 * keyboard and unaffected by a tap on the row.
 */
export default function IngredientListItem({
  ingredient,
  selected,
  onToggle,
  onAnchor,
  className,
}: IngredientListItemProps) {
  const id = useId();
  return (
    <li
      className={cn(
        "relative flex items-start gap-2 rounded-lg px-2 py-1 -mx-2 select-none transition-colors active:opacity-60 text-gray-700",
        // Raise IngredientItem's controls above the row-covering label: they follow it
        // in DOM order, so being positioned is enough to paint (and click) on top.
        "[&_button]:relative [&_select]:relative [&_input]:relative",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/60",
        selected && "bg-green-50",
        className,
      )}
    >
      <input
        type="checkbox"
        id={id}
        checked={selected}
        onChange={onToggle}
        className={cn(
          "mt-1.5 w-1.5 h-1.5 shrink-0 appearance-none rounded-full transition-colors focus-visible:outline-none",
          selected ? "bg-green-500" : "bg-brand",
        )}
      />
      {/* Covers the row so any tap toggles; `cursor-pointer` because globals.css's base
          rule reaches button/select/[role=button] only. */}
      <label htmlFor={id} className="absolute inset-0 cursor-pointer">
        <span className="sr-only">{ingredient.original}</span>
      </label>
      <IngredientItem ingredient={ingredient} onAnchor={onAnchor} />
    </li>
  );
}
