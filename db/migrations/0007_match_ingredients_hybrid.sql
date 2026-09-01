-- 0007_match_ingredients_hybrid
--
-- Ingredient manager — replace the pure-semantic match_ingredients() (0005)
-- with hybrid keyword + semantic matching. Applied via the Supabase MCP
-- `apply_migration` tool (checked-in record only; see 0002).
--
-- Why hybrid (PR #40 review): ingredient names are short strings (1-4 words).
-- Pure vector search is fuzzy on near-exact matches; pure keyword search
-- misses paraphrases ("scallion" vs "green onion"). Following the Supabase
-- hybrid-search pattern, both signals are rank-fused with Reciprocal Rank
-- Fusion: score = Σ weight * 1/(rrf_k + rank), rrf_k = 50.
--
-- Why trigram, not tsvector, for the keyword signal: on 1-4 word strings
-- pg_trgm similarity() tolerates typos and plural/word-form variance and
-- scores near-exact name/alias matches at ~1.0, while document-oriented
-- ts_rank_cd() is nearly meaningless at that length and stemmed FTS misses
-- typos entirely. Keyword similarity is the best-of over `name` and each
-- alias — aliases exist precisely to catch alternate names.
--
-- Why one scored CTE instead of the docs' two limited CTEs + full outer
-- join: the catalog is small (hundreds to low thousands), a seq scan is
-- trivially cheap, and scoring every row means both similarity columns are
-- always populated (never null from a one-sided join) so callers can
-- threshold on the raw similarities. The two-list-with-limits shape (plus
-- gin_trgm_ops/hnsw indexes) is the upgrade path if the catalog gets big.
--
-- The 0005 `where i.embedding is not null` guard is gone: the column is
-- NOT NULL as of 0006. `min_similarity` is gone too — an RRF score is not a
-- similarity, so a single floor is ill-defined; callers filter on the
-- returned raw scores instead.
--
-- search_path is pinned to `public` — not '' — because the pgvector `<=>`
-- operator and pg_trgm similarity() both live in public and lookup follows
-- search_path.
--
-- Execution is service-role-only: callers go through
-- src/lib/ingredients.ts matchIngredients() on getSupabaseAdminClient().

-- Already installed on the project (v1.6, public schema); recorded for
-- reproducibility.
create extension if not exists pg_trgm;

-- The return type changes, so `create or replace` would error.
drop function if exists public.match_ingredients(vector, int, float);

create function public.match_ingredients(
  query_text text,
  query_embedding vector(768),
  match_count int default 5,
  rrf_k int default 50,
  semantic_weight float default 1,
  keyword_weight float default 1
)
returns table (
  id uuid,
  name text,
  nutrition jsonb,
  density_g_per_ml numeric,
  semantic_similarity float,
  keyword_similarity float,
  score float
)
language sql
stable
set search_path = public
as $$
  with scored as (
    select
      i.id,
      i.name,
      i.nutrition,
      i.density_g_per_ml,
      1 - (i.embedding <=> query_embedding) as semantic_similarity,
      greatest(
        similarity(i.name, query_text),
        coalesce(
          (select max(similarity(a, query_text)) from unnest(i.aliases) a),
          0
        )
      )::float as keyword_similarity
    from public.ingredients i
  ),
  ranked as (
    select
      *,
      row_number() over (order by semantic_similarity desc) as semantic_rank,
      row_number() over (order by keyword_similarity desc) as keyword_rank
    from scored
  )
  select
    id,
    name,
    nutrition,
    density_g_per_ml,
    semantic_similarity,
    keyword_similarity,
    semantic_weight * (1.0 / (rrf_k + semantic_rank))
      + keyword_weight * (1.0 / (rrf_k + keyword_rank)) as score
  from ranked
  order by score desc
  limit match_count;
$$;

revoke execute on function
  public.match_ingredients(text, vector, int, int, float, float)
  from public, anon, authenticated;
