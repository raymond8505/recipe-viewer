-- 0008_search_ingredients_keyword
--
-- NutritionDetail autocomplete — keyword-only trigram search over the
-- ingredient catalog. Applied via the Supabase MCP `apply_migration` tool
-- (checked-in record only; see 0002).
--
-- This is the keyword half of match_ingredients (0007) with the semantic/RRF
-- side dropped: the autocomplete has a human in the loop reading the results,
-- so typo-tolerant trigram ranking is enough and skipping the embedding call
-- keeps every keystroke cheap (no Gemini round-trip). The similarity
-- expression — best-of pg_trgm similarity() over `name` and each alias — is
-- lifted verbatim from 0007 so the two functions rank keywords identically.
--
-- Same single scored-CTE shape as 0007: the catalog is small, a seq scan is
-- trivially cheap, and the CTE sidesteps the alias-vs-function `similarity`
-- ambiguity in ORDER BY. `aliases` is returned so the UI can show which
-- alias a hit came from.
--
-- Execution is service-role-only: callers go through
-- src/lib/ingredients.ts searchIngredientsKeyword() on getSupabaseAdminClient().

create function public.search_ingredients_keyword(
  query_text text,
  match_count int default 8
)
returns table (
  id uuid,
  name text,
  aliases text[],
  nutrition jsonb,
  density_g_per_ml numeric,
  similarity float
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
      greatest(
        similarity(i.name, query_text),
        coalesce(
          (select max(similarity(a, query_text)) from unnest(i.aliases) a),
          0
        )
      )::float as similarity
    from public.ingredients i
  )
  select *
  from scored
  order by similarity desc, name asc
  limit match_count;
$$;

revoke execute on function
  public.search_ingredients_keyword(text, int)
  from public, anon, authenticated;
