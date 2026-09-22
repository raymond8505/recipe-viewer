-- 0027_search_recipes_ranked_name_column
--
-- Point the ranked-search RPC at `recipes.name`, and constrain the column now
-- that every reader depends on it. Applied via the Supabase MCP
-- `apply_migration` tool (checked-in record only; see 0002).
--
-- Why both in one migration: they are the same statement about the column —
-- that it is the recipe's name, not a copy of one. The RPC was the last reader
-- of `metadata->'schema'->>'name'` (the four PostgREST sites moved in the same
-- commit as this file), so after this nothing in the system reads the blob's
-- name, and NOT NULL is what makes the column safe to read without a fallback.
--
-- ORDER MATTERS: this runs AFTER scripts/backfill-recipe-blob-fields.ts, which
-- reports any row whose name is missing from both the column and the blob. 0026
-- deliberately left the constraint out for exactly that reason. Verified 0 such
-- rows across 578 before applying.
--
-- The function body is otherwise unchanged from 0025 — same signature, so
-- `create or replace` keeps the existing grants. Five references move:
-- `sort_name`, `name_hit`, the match predicate and the two junk-name guards.
--
-- ONE ROW CHANGES VISIBILITY, and it is a fix rather than a side effect. A NULL
-- blob name made `(metadata->'schema'->>'name') not ilike '%null%'` evaluate to
-- NULL, which an AND drops — so the recipe was filtered out of every listing and
-- every search by a guard meant to catch the literal text "null" in a title.
-- Its column has held a good name the whole time. Reading the column returns it.

create or replace function public.search_recipes_ranked(
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
           lower(r.name) as sort_name,
           (r.name ilike pat.p) as name_hit,
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
     where (r.name ilike pat.p
            or public.ingredient_catalog_text(r.*) ilike pat.p)
       and r.name not ilike '%(NEEDS RE-SCRAPE)%'
       and r.name not ilike '%null%'
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

alter table public.recipes
  alter column name set not null;
