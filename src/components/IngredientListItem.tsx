"use client";

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
 * One ingredient line as a tappable shopping-list checkbox: the whole row
 * toggles, a dot shows the state, and `IngredientItem` renders the amount, unit
 * and text. Tapping the editable amount does not toggle the row.
 */
export default function IngredientListItem({
  ingredient,
  selected,
  onToggle,
  onAnchor,
  className,
}: IngredientListItemProps) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-lg px-2 py-1 -mx-2 cursor-pointer select-none transition-colors active:opacity-60 text-gray-700",
        selected && "bg-green-50",
        className,
      )}
      onClick={onToggle}
      role="checkbox"
      aria-checked={selected}
      aria-label={ingredient.original}
    >
      <span
        className={cn(
          "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 transition-colors",
          selected ? "bg-green-500" : "bg-brand",
        )}
      />
      <IngredientItem ingredient={ingredient} onAnchor={onAnchor} />
    </li>
  );
}
