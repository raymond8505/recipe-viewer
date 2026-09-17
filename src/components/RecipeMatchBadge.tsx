import type { ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import { SearchIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { matchedCatalogIngredients } from "@/lib/format";
import type { RecipeIngredientGroup } from "@/types/recipe";

interface RecipeMatchBadgeProps {
  /** The catalog ingredient's name — why this recipe is in the results. */
  name: string;
  /** Extra classes for the caller. */
  className?: string;
}

/**
 * Purpose-built pill naming the ingredient that put a recipe in a set of search
 * results. Neutral surface like `RecipeNutritionBadge`, so the brand accent
 * stays with the category badge and keeps meaning something.
 *
 * It exists because recipe search matches ingredients as well as names: without
 * it, a search for "cilantro" returning a recipe called "Weeknight Tacos" reads
 * as a broken result rather than a useful one. The magnifier says "this is what
 * you searched for", which the name alone can't.
 */
export function RecipeMatchBadge({ name, className }: RecipeMatchBadgeProps) {
  return (
    <Badge
      title={`Matches your search for ${name}`}
      className={cn(
        "gap-1 rounded-full bg-muted text-muted-foreground",
        className,
      )}
    >
      <SearchIcon size={12} className="text-muted-foreground" />
      {name}
    </Badge>
  );
}

/**
 * The match badges a recipe shows for `query` — empty whenever the query is
 * empty, the recipe matched on its name alone, or its lines were read without
 * the catalog, which is the common case on any unsearched listing.
 *
 * Takes the groups rather than the whole recipe: the badge is about the
 * ingredient list and nothing else, so a caller can hand over a drafted list
 * that has no row behind it yet.
 */
export function recipeMatchBadges(
  groups: readonly RecipeIngredientGroup[],
  query: string,
): ReactElement[] {
  return matchedCatalogIngredients(groups, query).map((name) => (
    <RecipeMatchBadge key={name} name={name} />
  ));
}
