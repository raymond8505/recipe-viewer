import type { ScaledIngredient, ScaledIngredientGroup } from "@/lib/ScalableRecipe";
import IngredientListItem from "@/components/IngredientListItem";
import { cn } from "@/lib/utils";

interface IngredientGroupProps {
  group: ScaledIngredientGroup;
  isSelected: (ingredient: ScaledIngredient) => boolean;
  onToggle: (ingredient: ScaledIngredient) => void;
  /** Makes each amount editable; omit it for read-only amounts. */
  onAnchor?: (ingredient: ScaledIngredient, amountInBaseUnit: number) => void;
  /** Merged onto the heading, which sets no text size of its own. */
  headingClassName?: string;
  /** Handed to every row as its `className`. */
  itemClassName?: string;
}

/** One ingredient group: its heading (none for the nameless group) over its checkbox rows. */
export default function IngredientGroup({
  group,
  isSelected,
  onToggle,
  onAnchor,
  headingClassName,
  itemClassName,
}: IngredientGroupProps) {
  return (
    <div>
      {group.heading && (
        <h3
          className={cn(
            "font-sans font-semibold uppercase tracking-widest text-brand mb-2",
            headingClassName,
          )}
        >
          {group.heading}
        </h3>
      )}
      <ul className="space-y-2">
        {group.items.map((ingredient) => (
          <IngredientListItem
            key={ingredient.id}
            ingredient={ingredient}
            selected={isSelected(ingredient)}
            onToggle={() => onToggle(ingredient)}
            onAnchor={onAnchor && ((amount) => onAnchor(ingredient, amount))}
            className={itemClassName}
          />
        ))}
      </ul>
    </div>
  );
}
