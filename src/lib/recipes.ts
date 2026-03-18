import { getSupabaseClient } from "./supabase";
import type { RecipeRow, RecipesResult } from "@/types/recipe";

const PAGE_SIZE = 24;

export async function getRecipes(opts?: {
  query?: string;
  page?: number;
  limit?: number;
}): Promise<RecipesResult> {
  const supabase = getSupabaseClient();
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? PAGE_SIZE;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let queryBuilder = supabase
    .from("recipes")
    .select("id, url, source, metadata", { count: "exact" })
    .not("metadata->schema->>name", "ilike", "%(NEEDS RE-SCRAPE)%")
    .not("metadata->schema->>name", "ilike", "%null%")
    .in("source", ["raymonds.recipes"])
    .range(from, to)
    .order("id", { ascending: false });

  if (opts?.query) {
    queryBuilder = queryBuilder.ilike("metadata->schema->>name", `%${opts.query}%`);
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
