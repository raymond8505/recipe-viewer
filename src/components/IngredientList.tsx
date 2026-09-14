import type { ComponentProps } from "react";
import type { ScaledIngredientGroup } from "@/lib/ScalableRecipe";
import IngredientGroup from "@/components/IngredientGroup";

interface IngredientListProps extends Omit<ComponentProps<typeof IngredientGroup>, "group"> {
  groups: ScaledIngredientGroup[];
}

/** A recipe's ingredients as shopping-list checkboxes, group by group. Every prop but `groups` goes to each group. */
export default function IngredientList({ groups, ...groupProps }: IngredientListProps) {
  return (
    <div className="space-y-4">
      {groups.map((group, gi) => (
        <IngredientGroup key={gi} group={group} {...groupProps} />
      ))}
    </div>
  );
}
