import { Suspense } from "react";
import type { Metadata } from "next";
import { getRecipes, getSources, getStatusCounts, type SortOption } from "@/lib/recipes";
import { getFeatures } from "@/lib/features";
import { getIsLoggedIn } from "@/lib/auth";
import RecipeGrid from "@/components/RecipeGrid";
import RecipeStateProvider from "@/components/RecipeStateProvider";
import SearchBar from "@/components/SearchBar";
import SortBar from "@/components/SortBar";
import SourceFilter from "@/components/SourceFilter";
import StatusFilter from "@/components/StatusFilter";
import Pagination from "@/components/Pagination";

const PAGE_SIZE = 24;
const VALID_SORTS = new Set<SortOption>(["newest", "oldest", "name-asc", "name-desc"]);

export const metadata: Metadata = {
  title: "Recipe Viewer",
};

interface HomeProps {
  searchParams: Promise<{ q?: string; page?: string; sort?: string; source?: string; status?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { q, page: pageParam, sort: sortParam, source: sourceParam, status: statusParam } = await searchParams;
  const query = q ?? "";
  const page = Math.max(1, Number(pageParam ?? 1));
  const sort: SortOption = VALID_SORTS.has(sortParam as SortOption)
    ? (sortParam as SortOption)
    : "newest";

  const isLoggedIn = await getIsLoggedIn();
  const features = getFeatures(isLoggedIn);

  const [{ data: recipes, count }, sources, statusCounts] = await Promise.all([
    getRecipes({ query, page, limit: PAGE_SIZE, sort, source: sourceParam, status: statusParam, isLoggedIn }),
    features.showSourceFilter ? getSources({ isLoggedIn }) : Promise.resolve([]),
    features.showStatusFilter ? getStatusCounts({ query, source: sourceParam, isLoggedIn }) : Promise.resolve({}),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Recipes</h1>
        <p className="text-gray-500 text-sm">{count} recipes in the collection</p>
      </div>

      <Suspense>
        <SearchBar defaultValue={query} />
      </Suspense>

      <Suspense>
        <SortBar current={sort} />
      </Suspense>

      {sources.length > 1 && (
        <Suspense>
          <SourceFilter sources={sources} current={sourceParam} />
        </Suspense>
      )}

      {features.showStatusFilter && (
        <Suspense>
          <StatusFilter counts={statusCounts} current={statusParam} />
        </Suspense>
      )}

      <RecipeStateProvider schemas={recipes.map((r) => r.metadata.schema)} />
      <RecipeGrid recipes={recipes} />

      <Suspense>
        <Pagination page={page} total={count} pageSize={PAGE_SIZE} />
      </Suspense>
    </div>
  );
}
