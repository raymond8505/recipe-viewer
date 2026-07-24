import { Badge } from "@/components/ui/badge";
import type { NutrientSource } from "@/lib/nutritionMath";

/**
 * Provenance badge for a single nutrition value: whether it was computed from
 * the normalized ingredient list ("ingredients") or read from the recipe's own
 * nutrition fields ("recipe").
 *
 * @summary shows where a nutrition value came from
 */
export default function NutritionSourceBadge({
  source,
}: {
  source: NutrientSource;
}) {
  if (source === "normalized") {
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
