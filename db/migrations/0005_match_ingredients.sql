-- 0005_match_ingredients
--
-- Ingredient manager — pgvector cosine similarity search over the ingredient
-- catalog. Applied via the Supabase MCP `apply_migration` tool (checked-in
-- record only; see 0002).
--
-- similarity = 1 - cosine distance, so 1.0 is identical direction. Embeddings
-- are stored raw (un-normalized); cosine distance is scale-invariant so this
-- is equivalent to normalized storage.
--
-- search_path is pinned (function_search_path_mutable advisor) to `public` —
-- not '' — because the pgvector `<=>` operator lives in the public schema and
-- operator lookup follows search_path.
--
-- Execution is service-role-only: callers go through
-- src/lib/ingredients.ts matchIngredients() on getSupabaseAdminClient().

create or replace function public.match_ingredients(
  query_embedding vector(768),
  match_count int default 5,
  min_similarity float default .6
)
returns table (
  id uuid,
  name text,
  nutrition jsonb,
  density_g_per_ml numeric,
  similarity float
)
language sql
stable
set search_path = public
as $$
  select
    i.id,
    i.name,
    i.nutrition,
    i.density_g_per_ml,
    1 - (i.embedding <=> query_embedding) as similarity
  from public.ingredients i
  where i.embedding is not null
    and 1 - (i.embedding <=> query_embedding) >= min_similarity
  order by i.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_ingredients(vector, int, float)
  from public, anon, authenticated;
