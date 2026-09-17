import { Suspense } from "react";
import type { Metadata } from "next";
import { getRecipes, getStatusCounts, type SortOption } from "@/lib/recipes";
import { getFeatures } from "@/lib/features";
import { getIsLoggedIn } from "@/lib/auth";
import RecipeGrid from "@/components/RecipeGrid";
import { recipeMatchBadges } from "@/components/RecipeMatchBadge";
import { recipeNutritionBadges } from "@/components/RecipeNutritionBadge";
import SearchBar from "@/components/SearchBar";
import SortBar from "@/components/SortBar";
import StatusFilter from "@/components/StatusFilter";
import Pagination from "@/components/Pagination";

const PAGE_SIZE = 24;
const VALID_SORTS = new Set<SortOption>([
  "newest",
  "oldest",
  "name-asc",
  "name-desc",
]);

export const metadata: Metadata = {
  title: "Recipe Viewer",
};

interface HomeProps {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    source?: string;
    status?: string;
  }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const {
    q,
    page: pageParam,
    sort: sortParam,
    source: sourceParam,
    status: statusParam,
  } = await searchParams;
  const query = q ?? "";
  const page = Math.max(1, Number(pageParam ?? 1));
  const sort: SortOption = VALID_SORTS.has(sortParam as SortOption)
    ? (sortParam as SortOption)
    : "newest";

  const isLoggedIn = await getIsLoggedIn();
  const features = getFeatures(isLoggedIn);

  const [{ data: recipes, count }, statusCounts] = await Promise.all([
    getRecipes({
      query,
      page,
      limit: PAGE_SIZE,
      sort,
      source: sourceParam,
      status: statusParam,
      isLoggedIn,
      // The cards carry nutrition badges, which resolve off each line's
      // catalog ingredient.
      catalog: true,
    }),
    features.showStatusFilter
      ? getStatusCounts({ query, source: sourceParam, isLoggedIn })
      : Promise.resolve({}),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-gray-900 mb-1">Recipes</h1>
          <p className="text-gray-500 text-sm">
            {count} recipes in the collection
          </p>
        </div>
      </div>

      <Suspense>
        <SearchBar defaultValue={query} />
      </Suspense>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Suspense>
          <SortBar current={sort} />
        </Suspense>

        {features.showStatusFilter && (
          <Suspense>
            <StatusFilter counts={statusCounts} current={statusParam} />
          </Suspense>
        )}
      </div>

      <RecipeGrid
        recipes={recipes}
        showStatusBadge={isLoggedIn}
        // Search matches ingredients as well as names, so a card can be here
        // for a reason its title doesn't show. The match badge names that
        // ingredient and leads the footer, because why a card is on screen
        // matters more to someone reading results than its calories.
        // Supplying `badges` replaces the grid's default outright, so this owes
        // the nutrition badges too; with no query there is nothing to explain,
        // and leaving it undefined keeps the default untouched.
        badges={
          query
            ? (recipe) => [
                ...recipeMatchBadges(recipe.ingredients, query),
                ...recipeNutritionBadges(recipe),
              ]
            : undefined
        }
      />

      <Suspense>
        <Pagination page={page} total={count} pageSize={PAGE_SIZE} />
      </Suspense>
    </div>
  );
}
