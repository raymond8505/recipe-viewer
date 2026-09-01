import { Badge } from "@/components/ui/badge";
import type { NutritionSource } from "@/lib/ScalableRecipe";

/**
 * Provenance badge for the nutrition panel: whether the displayed values were
 * computed from the normalized ingredient list ("ingredients") or read from
 * the recipe's own nutrition fields ("recipe").
 *
 * @summary shows where the nutrition values came from
 */
export default function NutritionSourceBadge({
  source,
}: {
  source: NutritionSource;
}) {
  if (source === "ingredients") {
    return (
      <Badge variant="secondary" title="Computed from the ingredient list">
        ingredients
      </Badge>
    );
  }
  return (
    <Badge variant="outline" title="From the recipe's own nutrition data">
      recipe
    </Badge>
  );
}
