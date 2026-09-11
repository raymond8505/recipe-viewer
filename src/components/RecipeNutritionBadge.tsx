import type { ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatNutrientDisplay } from "@/lib/format";
import { ScalableRecipe } from "@/lib/ScalableRecipe";
import {
  recipeNormalizedNutrition,
  type NutrientField,
  type NutrientValue,
} from "@/lib/nutritionMath";
import type { RecipeRow } from "@/types/recipe";

// The word that names each nutrient on a badge. Calories is `null` because its
// unit already names it — "350 kcal calories" reads as a stutter where "24 g
// protein" reads as a fact. Keyed over the whole NutrientField union so a new
// field can't be displayed unnamed.
const NUTRIENT_BADGE_LABELS: Record<NutrientField, string | null> = {
  calories: null,
  proteinContent: "protein",
  carbohydrateContent: "carbs",
  fatContent: "fat",
  saturatedFatContent: "sat. fat",
  unsaturatedFatContent: "unsat. fat",
  fiberContent: "fiber",
  sugarContent: "sugar",
  sodiumContent: "sodium",
  cholesterolContent: "cholesterol",
};

/** What `recipeNutritionBadges` picks when the caller doesn't name fields. */
export const DEFAULT_CARD_NUTRIENTS: readonly NutrientField[] = [
  "calories",
  "proteinContent",
];

interface RecipeNutritionBadgeProps {
  /** Which nutrient this is — it supplies the label. */
  field: NutrientField;
  /** The per-serving amount. */
  value: NutrientValue;
  /** Extra classes for the caller. */
  className?: string;
}

/**
 * Purpose-built nutrition pill wrapping shadcn `Badge` — carries neutral
 * surface colors, so it reads as data beside `RecipeCategoryBadge`'s brand
 * accent rather than competing with it. (Badge's base already supplies the
 * padding/size/weight.)
 *
 * Per serving, always. A card has no room to spell that out, so the basis
 * lives in the tooltip — without it "350kcal" reads just as easily as the
 * whole recipe.
 *
 * Compact on the face, spaced in the tooltip: a card footer is measured in
 * pixels, a tooltip is read.
 */
export function RecipeNutritionBadge({
  field,
  value,
  className,
}: RecipeNutritionBadgeProps) {
  const label = NUTRIENT_BADGE_LABELS[field];
  const amount = formatNutrientDisplay(value, { compact: true });
  return (
    <Badge
      title={`${formatNutrientDisplay(value)} per serving`}
      className={cn("rounded-full bg-muted text-muted-foreground", className)}
    >
      {label ? `${amount} ${label}` : amount}
    </Badge>
  );
}

/**
 * The nutrition badges a recipe can show, in the order given — empty whenever
 * the recipe has no nutrition to show, which is the common case.
 *
 * Resolution goes through a default-state `ScalableRecipe.nutrition()`, the
 * single interface for a recipe's nutrition: it answers only when every line
 * is matched to the catalog and the servings are known, so a recipe that is
 * half-normalized, unnormalized, or read without the catalog
 * (`getRecipes` without `catalog: true`) shows nothing rather than a total
 * that undercounts the lines it couldn't price.
 */
export function recipeNutritionBadges(
  recipe: Pick<RecipeRow, "metadata" | "ingredients">,
  fields: readonly NutrientField[] = DEFAULT_CARD_NUTRIENTS,
): ReactElement[] {
  const nutrition = new ScalableRecipe(
    recipe.metadata.schema,
    recipe.ingredients,
    undefined,
    recipeNormalizedNutrition(recipe),
  ).nutrition();
  if (!nutrition) return [];

  return fields.flatMap((field) => {
    const value = nutrition[field];
    return value
      ? [<RecipeNutritionBadge key={field} field={field} value={value} />]
      : [];
  });
}
