import { Badge } from "@/components/ui/badge";
import type { IngredientSource } from "@/types/ingredient";

/**
 * Provenance badge for a catalog ingredient: USDA-sourced rows show their
 * FoodData Central id (the re-fetch key), hand-entered rows show "manual".
 *
 * @summary shows where an ingredient's data came from
 */
export default function IngredientSourceBadge({
  source,
  fdcId,
}: {
  source: IngredientSource;
  fdcId: number | null;
}) {
  if (source === "usda") {
    return (
      <Badge variant="secondary" title="USDA FoodData Central">
        {fdcId !== null ? `USDA ${fdcId}` : "USDA"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" title="Hand-entered">
      manual
    </Badge>
  );
}
