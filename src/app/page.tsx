import { Suspense } from "react";
import type { Metadata } from "next";
import { getRecipes, getStatusCounts, type SortOption } from "@/lib/recipes";
import { getFeatures } from "@/lib/features";
import { getIsLoggedIn } from "@/lib/auth";
import RecipeGrid from "@/components/RecipeGrid";
import RecipeStateProvider from "@/components/RecipeStateProvider";
import SearchBar from "@/components/SearchBar";
import SortBar from "@/components/SortBar";
import StatusFilter from "@/components/StatusFilter";
import Pagination from "@/components/Pagination";
import { composeRecipeSchema } from "@/lib/recipeSchema";

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

      <RecipeStateProvider schemas={recipes.map(composeRecipeSchema)} />
      <RecipeGrid recipes={recipes} showStatusBadge={isLoggedIn} />

      <Suspense>
        <Pagination page={page} total={count} pageSize={PAGE_SIZE} />
      </Suspense>
    </div>
  );
}
