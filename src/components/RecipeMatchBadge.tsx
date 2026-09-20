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
 * results. It rides in the card's TOP badge slot, beside the category and the
 * status, where a reader looks before reading the title.
 *
 * It exists because recipe search matches ingredients as well as names: without
 * it, a search for "cilantro" returning a recipe called "Weeknight Tacos" reads
 * as a broken result rather than a useful one. The magnifier says "this is what
 * you searched for", which the name alone can't.
 *
 * Green is an explicit color class rather than a theme token, on the same
 * grounds as `RecipeStatusBadge`'s per-status colors: this marks a search hit,
 * not a surface, so it sits outside the neutral/brand palette. The icon
 * inherits it — `SearchIcon` defaults to a muted grey that would read as
 * disabled against the green text beside it.
 */
export function RecipeMatchBadge({ name, className }: RecipeMatchBadgeProps) {
  return (
    <Badge
      title={`Matches your search for ${name}`}
      className={cn("gap-1 rounded-full bg-green-100 text-green-700", className)}
    >
      <SearchIcon size={12} className="text-green-700" />
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
