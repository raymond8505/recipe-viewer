-- 0012_match_ingredients_aliases
--
-- Ingredient manager — return `aliases` from match_ingredients(). Body is
-- otherwise identical to 0007. Applied via the Supabase MCP `apply_migration`
-- tool (checked-in record only; see 0002).
--
-- Why: since the fdc_id-identity refactor a catalog row's `name` is USDA's
-- description ("Butter, without salt") and the recipe-language wording lives
-- in `aliases` ("unsalted butter"). Every consumer of this RPC is deciding
-- "is this row the same ingredient as my recipe line?", and the aliases are
-- the field that most directly answers it — a row that already carries your
-- exact phrasing as an alias is a match, whatever the name looks like.
-- Without them the answer required a second round trip per candidate
-- (get_ingredient) purely to read a column the scan had already touched.
--
-- This also closes an asymmetry: keyword_similarity is computed as the
-- best-of over name AND each alias, so callers were being handed a score
-- derived from data they could not see.
--
-- The sibling keyword-only RPC (0008) has returned aliases from the start for
-- the same reason; this brings the hybrid path in line with it.
--
-- Not returned, deliberately: fdc_id, food_portions, source, timestamps.
-- Those are row bookkeeping rather than match evidence, and get_ingredient
-- remains the way to read a full row.

-- The return type changes, so `create or replace` would error. Note the
-- 6-arg signature — 0007 widened it from 0005's (vector, int, float).
drop function if exists public.match_ingredients(text, vector, int, int, float, float);

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
  aliases text[],
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
      i.aliases,
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
    aliases,
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
