import type { RecipeRow } from "@/types/recipe";
import RecipeCard from "./RecipeCard";

interface RecipeGridProps {
  recipes: RecipeRow[];
}

export default function RecipeGrid({ recipes }: RecipeGridProps) {
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
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
    </div>
  );
}
