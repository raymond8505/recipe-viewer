import type { ReactNode } from "react";
import type { RecipeRow } from "@/types/recipe";
import { toArray } from "@/lib/format";
import RecipeCard from "./RecipeCard";
import { recipeNutritionBadges } from "./RecipeNutritionBadge";
import { RecipeStatusBadge } from "./RecipeStatusBadge";
import { RecipeCategoryBadge } from "./RecipeCategoryBadge";

interface RecipeGridProps {
  recipes: RecipeRow[];
  /** Include each recipe's status in the badges overlaid on its image. */
  showStatusBadge?: boolean;
  /**
   * The badges overlaid on each card's image. Defaults to the recipe's first
   * category, preceded by its status when `showStatusBadge` is set — supplying
   * this takes over both, `showStatusBadge` included.
   */
  topBadges?: (recipe: RecipeRow) => ReactNode[];
  /**
   * The footer badges each card carries. Defaults to the recipe's calories and
   * protein, which come out empty unless the recipe resolves nutrition. Pass
   * `() => []` for a grid with none.
   */
  badges?: (recipe: RecipeRow) => ReactNode[];
}

/**
 * Status first so it keeps the corner it has always occupied, with the
 * category growing leftwards from it.
 */
function defaultTopBadges(
  recipe: RecipeRow,
  showStatusBadge?: boolean,
): ReactNode[] {
  const category = toArray(recipe.metadata.schema.recipeCategory)[0];
  return [
    category ? (
      <RecipeCategoryBadge key="category" category={category} />
    ) : null,
    showStatusBadge ? (
      <RecipeStatusBadge key="status" status={recipe.status} />
    ) : null,
  ].filter(Boolean);
}

export default function RecipeGrid({
  recipes,
  showStatusBadge,
  topBadges,
  badges = recipeNutritionBadges,
}: RecipeGridProps) {
  if (recipes.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg">No recipes found.</p>
      </div>
    );
  }

  const top =
    topBadges ??
    ((recipe: RecipeRow) => defaultTopBadges(recipe, showStatusBadge));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          topBadges={top(recipe)}
          badges={badges(recipe)}
        />
      ))}
    </div>
  );
}
