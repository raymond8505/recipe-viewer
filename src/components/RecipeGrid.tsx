import type { ReactNode } from "react";
import type { RecipeRow } from "@/types/recipe";
import RecipeCard from "./RecipeCard";
import { recipeNutritionBadges } from "./RecipeNutritionBadge";

interface RecipeGridProps {
  recipes: RecipeRow[];
  showStatusBadge?: boolean;
  /**
   * The footer badges each card carries. Defaults to the recipe's calories and
   * protein, which come out empty unless the recipe resolves nutrition. Pass
   * `() => []` for a grid with none.
   */
  badges?: (recipe: RecipeRow) => ReactNode[];
}

export default function RecipeGrid({
  recipes,
  showStatusBadge,
  badges = recipeNutritionBadges,
}: RecipeGridProps) {
  if (recipes.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg">No recipes found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          showStatusBadge={showStatusBadge}
          badges={badges(recipe)}
        />
      ))}
    </div>
  );
}
