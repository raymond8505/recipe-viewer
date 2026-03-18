import { Suspense } from "react";
import type { Metadata } from "next";
import { getRecipes } from "@/lib/recipes";
import RecipeGrid from "@/components/RecipeGrid";
import SearchBar from "@/components/SearchBar";
import Pagination from "@/components/Pagination";

const PAGE_SIZE = 24;

export const metadata: Metadata = {
  title: "Recipe Viewer",
};

interface HomeProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { q, page: pageParam } = await searchParams;
  const query = q ?? "";
  const page = Math.max(1, Number(pageParam ?? 1));

  const { data: recipes, count } = await getRecipes({
    query,
    page,
    limit: PAGE_SIZE,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Recipes</h1>
        <p className="text-gray-500 text-sm">{count} recipes in the collection</p>
      </div>

      <Suspense>
        <SearchBar defaultValue={query} />
      </Suspense>

      <RecipeGrid recipes={recipes} />

      <Suspense>
        <Pagination page={page} total={count} pageSize={PAGE_SIZE} />
      </Suspense>
    </div>
  );
}
