-- 0027_search_recipes_line_labels
--
-- Recipe search also matches a recipe's own ingredient wording, not only the
-- catalog vocabulary its lines resolved to. Applied via the Supabase MCP
-- `apply_migration` tool (checked-in record only; see 0002).
--
-- WHY THIS WIDENS 0023. That migration joined the catalog INNER on purpose:
-- search reached a recipe only through a controlled vocabulary, and an
-- unmatched line was treated as having no agreed name to search. The cost of
-- that is a reader searching for a food this corpus HAS and getting nothing,
-- because the lines naming it are the ones normalization could not resolve —
-- precisely the recipes least likely to be found any other way. A line's
-- parsed `name_text` is an agreed-enough name for a reader typing a food into
-- a search box, so it becomes a second, lower-priority arm rather than
-- staying unreachable.
--
-- `name_text`, not `raw_text`. The parsed name is the food the line is about;
-- the raw line carries its quantity, unit and preparation, so a query of
-- "cup" or "2" would match most of the corpus. For a line the parser could
-- not read, `name_text` IS the whole lowercased line, so nothing is lost
-- where it matters most.
--
-- EVERY line, matched or not. A matched line's own wording is still worth
-- searching: the catalog may hold "Coriander, raw" where the recipe says
-- "cilantro" and no alias has been accreted yet. The tier below is what keeps
-- that from outranking a real catalog hit.
--
-- NEWLINE-separated, never spaces, for the reason 0023 records: the caller's
-- arm is a plain `ilike '%q%'` over whatever this returns, and a space-joined
-- blob lets a query straddle two lines — "pepper salt" matching a recipe that
-- contains "black pepper" and "salt" and no such phrase. A newline cannot
-- occur in a search box value.
--
-- COST. Two correlated subqueries per candidate row where 0023 had one, each
-- carried by the (recipe_id, line_id) index; this one is strictly cheaper
-- than 0023's since it needs no join to `ingredients`. The ranked function
-- below evaluates each computed field ONCE per row (the hit booleans are
-- selected in the CTE and filtered in an outer one) rather than once in its
-- WHERE and again in its SELECT. If the corpus grows an order of magnitude
-- the upgrade path is unchanged: a trigram GIN index or a maintained search
-- column, not a different query shape.
--
-- AUTHORIZATION. Same posture as 0023, which is the precedent for granting a
-- function here to `anon`. Who may call it: anyone. `getRecipes` runs on the
-- publishable/anon client and `GET /api/recipes` is public-read, so the grant
-- is required for search to work logged out. What credential proves it: none,
-- matching the `recipes` table it filters, which has RLS disabled. What an
-- anonymous caller gets: per recipe, the parsed names of that recipe's own
-- ingredient lines. SECURITY DEFINER is needed because `recipe_ingredients`
-- is RLS-locked with no policies. This exposes strictly LESS than 0023 does:
-- ingredient line text is already public (the home page server-renders it,
-- /api/recipes returns it), and unlike 0023 this reaches no catalog row, so
-- no alias vocabulary becomes newly readable. Text only, no ids, no
-- nutrition, and only for lines belonging to a recipe.

create function public.ingredient_line_text(r public.recipes)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select string_agg(ri.name_text, E'\n')
  from public.recipe_ingredients ri
  where ri.recipe_id = r.id
    and ri.name_text <> '';
$$;

grant execute on function public.ingredient_line_text(public.recipes)
  to anon, authenticated;

-- TIERS replace a single score as the ordering key, because "a catalog hit
-- beats a line-label hit" cannot be expressed as a number in the old scale: a
-- catalog hit whose lines have no weight already scores 0 (0025 keeps those
-- visible rather than dropping them), so there is no value below it left for a
-- label hit to take. The tier is explicit instead:
--
--   3  the recipe's NAME matched — a title says what a recipe IS
--   2  a matched line's CATALOG name or alias matched
--   1  only the recipe's own line wording matched
--
-- Within a tier the score is 0025's share of the recipe by weight, unchanged,
-- so the ordering a reader already sees is preserved inside tier 2 and the
-- same reasoning extends to tier 1. `score` is consumed by nothing but this
-- ORDER BY (the caller reads ids in the order returned), so splitting the key
-- in two costs no consumer.
--
-- The return type changes, so the old function is dropped rather than
-- replaced: CREATE OR REPLACE cannot alter a function's result type.

drop function if exists public.search_recipes_ranked(
  text, text, text, boolean, text, int, int
);

create function public.search_recipes_ranked(
  p_query text,
  p_source text default null,
  p_status text default null,
  p_published_only boolean default false,
  p_sort text default 'newest',
  p_limit int default 24,
  p_offset int default 0
)
returns table (id uuid, tier int, score numeric, total_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with pat as (select '%' || coalesce(p_query, '') || '%' as p),
  candidate as (
    select r.id,
           r.created_at,
           lower(r.metadata->'schema'->>'name') as sort_name,
           ((r.metadata->'schema'->>'name') ilike pat.p) as name_hit,
           (public.ingredient_catalog_text(r.*) ilike pat.p) as catalog_hit,
           (public.ingredient_line_text(r.*) ilike pat.p) as label_hit,
           coalesce(
             nullif(case lower(r.total_weight_unit)
                      when 'g'  then r.total_weight_amount
                      when 'kg' then r.total_weight_amount * 1000
                    end, 0),
             nullif((select sum(ri.resolved_grams)
                       from recipe_ingredients ri
                      where ri.recipe_id = r.id), 0)
           ) as denominator,
           (select sum(ri.resolved_grams)
              from recipe_ingredients ri
              join ingredients i on i.id = ri.ingredient_id
             where ri.recipe_id = r.id
               and (i.name ilike pat.p
                    or exists (select 1 from unnest(i.aliases) a where a ilike pat.p))
           ) as matched_grams,
           (select sum(ri.resolved_grams)
              from recipe_ingredients ri
             where ri.recipe_id = r.id
               and ri.name_text ilike pat.p
           ) as label_grams
      from recipes r, pat
     where (r.metadata->'schema'->>'name') not ilike '%(NEEDS RE-SCRAPE)%'
       and (r.metadata->'schema'->>'name') not ilike '%null%'
       and (p_source is null or r.source = p_source)
       and (case
              when p_published_only then r.status = 'published'
              when p_status is not null then r.status::text = p_status
              else (r.status is null or r.status <> 'archived')
            end)
  ),
  matched as (
    select * from candidate c
     where c.name_hit or c.catalog_hit or c.label_hit
  ),
  ranked as (
    select m.id,
           case when m.name_hit then 3
                when m.catalog_hit then 2
                else 1
           end as tier,
           case when m.name_hit then 1::numeric
                when m.catalog_hit
                  then coalesce(m.matched_grams / nullif(m.denominator, 0), 0)
                else coalesce(m.label_grams / nullif(m.denominator, 0), 0)
           end as score,
           m.created_at,
           m.sort_name,
           count(*) over () as total_count
      from matched m
  )
  select ranked.id, ranked.tier, ranked.score, ranked.total_count
    from ranked
   order by ranked.tier desc,
            ranked.score desc,
            case when p_sort = 'oldest'    then ranked.created_at end asc  nulls last,
            case when p_sort = 'newest'    then ranked.created_at end desc nulls last,
            case when p_sort = 'name-asc'  then ranked.sort_name  end asc  nulls last,
            case when p_sort = 'name-desc' then ranked.sort_name  end desc nulls last,
            ranked.id
   limit p_limit offset p_offset;
$$;

grant execute on function public.search_recipes_ranked(
  text, text, text, boolean, text, int, int
) to anon, authenticated;
