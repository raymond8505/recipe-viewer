-- 0025_search_recipes_ranked
--
-- Rank a recipe search by how much of the recipe the matched ingredient
-- actually is. Applied via the Supabase MCP `apply_migration` tool
-- (checked-in record only; see 0002).
--
-- WHY AN RPC AT ALL. Relevance here is a function of the QUERY, and PostgREST
-- can only order by a column or a computed field — neither of which can see
-- the search term. So ordering has to happen in SQL, and once it does, the
-- filtering, the paging and the exact count have to come with it: a page is
-- meaningless unless the same statement that ranked also filtered and counted.
-- That is the cost this function pays, and the reason `getRecipes` still uses
-- its plain PostgREST query for every unranked read (browsing, and any search
-- where the reader picked an explicit sort).
--
-- SCORING. A name hit scores 1.0 — a title says what a recipe IS, so nothing
-- outranks it. Otherwise the score is the matched ingredients' share of the
-- recipe by weight: 454 g of ground beef in an 800 g recipe scores 0.57 and
-- beats an 11 g bouillon cube in the same recipe at 0.01, which is the whole
-- point. Lines are SUMMED, not maxed: two lines of onion really is more onion.
--
-- THE DENOMINATOR IS BEST-EFFORT, in this order: the recipe's stated raw
-- weight (`total_weight_amount`, grams or kg — the only units 0022 stores),
-- else what its lines add up to. The second is an undercount wherever a line
-- could not be weighed, which inflates the share; that is accepted, because
-- the alternative is refusing to rank two thirds of the matches. It sharpens
-- on its own as normalization fills `resolved_grams` in, with no code change.
-- A recipe with neither scores 0 and sorts below anything measurable rather
-- than being dropped.
--
-- MATCHING IS `ingredient_catalog_text` (0023), the same computed field
-- `getStatusCounts` filters on, so the ranked page and the status chips beside
-- it can never disagree about which recipes match. Scoring is layered on top;
-- it never widens or narrows the set.
--
-- TIES FALL BACK TO THE READER'S SORT. Every unmatched-by-name recipe with no
-- weighable match scores 0, so without a tiebreak their order would be
-- whatever the planner produced. Only one CASE arm is non-null per call.
--
-- Returns ids, not rows: `getRecipes` re-reads them through its normal
-- `selectColumns<RecipeRowColumns>()` query, so the typed column list stays the
-- one description of a recipe row and this function never has to be edited
-- when a column is added. `total_count` rides on every row (a window count) so
-- one round trip answers both "which page" and "how many".
--
-- SECURITY DEFINER for the same reason 0023 is: `recipe_ingredients` and
-- `ingredients` are RLS-locked with no policies, and the list query runs on the
-- anon client. It exposes no more than 0023 already does — ids and a number —
-- and takes no argument naming a column.

create function public.search_recipes_ranked(
  p_query text,
  p_source text default null,
  p_status text default null,
  p_published_only boolean default false,
  p_sort text default 'newest',
  p_limit int default 24,
  p_offset int default 0
)
returns table (id uuid, score numeric, total_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with pat as (select '%' || coalesce(p_query, '') || '%' as p),
  matched as (
    select r.id,
           r.created_at,
           lower(r.metadata->'schema'->>'name') as sort_name,
           ((r.metadata->'schema'->>'name') ilike pat.p) as name_hit,
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
           ) as matched_grams
      from recipes r, pat
     where ((r.metadata->'schema'->>'name') ilike pat.p
            or public.ingredient_catalog_text(r.*) ilike pat.p)
       and (r.metadata->'schema'->>'name') not ilike '%(NEEDS RE-SCRAPE)%'
       and (r.metadata->'schema'->>'name') not ilike '%null%'
       and (p_source is null or r.source = p_source)
       and (case
              when p_published_only then r.status = 'published'
              when p_status is not null then r.status::text = p_status
              else (r.status is null or r.status <> 'archived')
            end)
  ),
  ranked as (
    select m.id,
           case when m.name_hit then 1::numeric
                else coalesce(m.matched_grams / nullif(m.denominator, 0), 0)
           end as score,
           m.created_at,
           m.sort_name,
           count(*) over () as total_count
      from matched m
  )
  select ranked.id, ranked.score, ranked.total_count
    from ranked
   order by ranked.score desc,
            case when p_sort = 'oldest'    then ranked.created_at end asc  nulls last,
            case when p_sort = 'newest'    then ranked.created_at end desc nulls last,
            case when p_sort = 'name-asc'  then ranked.sort_name  end asc  nulls last,
            case when p_sort = 'name-desc' then ranked.sort_name  end desc nulls last,
            ranked.id
   limit p_limit offset p_offset;
$$;

grant execute on function public.search_recipes_ranked(text, text, text, boolean, text, int, int)
  to anon, authenticated;
