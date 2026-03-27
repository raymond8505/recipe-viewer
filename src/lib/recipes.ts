import { getSupabaseClient } from "./supabase";
import { getFeatures } from "./features";
import type { RecipeRow, RecipesResult } from "@/types/recipe";

const PAGE_SIZE = 24;

export type SortOption = "newest" | "oldest" | "name-asc" | "name-desc";

export async function getSources(opts?: { isLoggedIn?: boolean }): Promise<string[]> {
  const supabase = getSupabaseClient();
  const features = getFeatures(opts?.isLoggedIn ?? false);

  let queryBuilder = supabase
    .from("recipes")
    .select("source")
    .not("metadata->schema->>name", "ilike", "%(NEEDS RE-SCRAPE)%")
    .not("metadata->schema->>name", "ilike", "%null%");

  if (features.filterByOwnSource) {
    queryBuilder = queryBuilder.in("source", ["raymonds.recipes"]);
  }

  if (features.filterByStatus) {
    queryBuilder = queryBuilder.eq("metadata->>status", "published");
  }

  const { data, error } = await queryBuilder;

  if (error || !data) return [];

  const sources = [...new Set(data.map((r) => r.source).filter(Boolean))];
  return sources.sort();
}

export async function getRecipes(opts?: {
  query?: string;
  page?: number;
  limit?: number;
  sort?: SortOption;
  source?: string;
  isLoggedIn?: boolean;
}): Promise<RecipesResult> {
  const supabase = getSupabaseClient();
  const features = getFeatures(opts?.isLoggedIn ?? false);
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? PAGE_SIZE;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const sortMap: Record<SortOption, { column: string; ascending: boolean }> = {
    newest:    { column: "created_at", ascending: false },
    oldest:    { column: "created_at", ascending: true },
    "name-asc":  { column: "metadata->schema->>name", ascending: true },
    "name-desc": { column: "metadata->schema->>name", ascending: false },
  };
  const { column, ascending } = sortMap[opts?.sort ?? "newest"];

  let queryBuilder = supabase
    .from("recipes")
    .select("id, url, source, metadata", { count: "exact" })
    .not("metadata->schema->>name", "ilike", "%(NEEDS RE-SCRAPE)%")
    .not("metadata->schema->>name", "ilike", "%null%")
    .range(from, to)
    .order(column, { ascending });

  if (features.filterByOwnSource) {
    queryBuilder = queryBuilder.in("source", ["raymonds.recipes"]);
  }

  if (features.filterByStatus) {
    queryBuilder = queryBuilder.eq("metadata->>status", "published");
  }

  if (opts?.source) {
    queryBuilder = queryBuilder.eq("source", opts.source);
  }

  if (opts?.query) {
    const q = opts.query.slice(0, 200);
    queryBuilder = queryBuilder.ilike("metadata->schema->>name", `%${q}%`);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.error("Supabase error fetching recipes:", error);
    return { data: [], count: 0 };
  }

  return {
    data: (data as RecipeRow[]) ?? [],
    count: count ?? 0,
  };
}

export async function getRecipeById(id: string): Promise<RecipeRow | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("recipes")
    .select("id, url, source, metadata")
    .eq("id", id)
    .single();

  if (error || !data) return null;

  return data as RecipeRow;
}
