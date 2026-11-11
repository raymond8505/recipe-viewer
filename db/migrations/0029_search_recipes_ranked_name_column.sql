-- 0029_search_recipes_ranked_name_column
--
-- Point the ranked-search function at `recipes.name`. Applied via the Supabase
-- MCP `apply_migration` tool (checked-in record only; see 0002).
--
-- Why this supersedes a function two migrations old: 0027 and 0028 were written
-- in parallel and met in a merge. 0027 gave search its third arm and its tier
-- ordering while the recipe's name still lived in the `metadata` blob; 0028
-- promoted that name to a column and made it the only place anything reads it.
-- This is the one definition that holds both, and it is the definition to edit.
--
-- The body is 0027's, unchanged except for where the name comes from: four
-- references — `sort_name`, `name_hit`, and the two junk-name guards — move from
-- `metadata->'schema'->>'name'` to `r.name`. The three arms, the tiers, the
-- weight-share scoring within a tier and the reader's-sort tiebreak are all
-- 0027's and are deliberately untouched.
--
-- WHAT CHANGES FOR A READER. One recipe gains visibility. A NULL blob name made
-- `not ilike '%null%'` evaluate to NULL, and an AND dropped the row — so a
-- failed scrape whose name column was fine (Mediterranean Stuffed Peppers) was
-- filtered out of every search by a guard meant to catch the literal word
-- "null" in a title. Against a NOT NULL column (0029's companion constraint
-- below) the guards mean what they say.
--
-- Dropped and recreated rather than replaced, for 0027's reason: the return
-- type is part of the signature, and this keeps the two files' shapes identical
-- so a diff between them shows only the name change.

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
           lower(r.name) as sort_name,
           (r.name ilike pat.p) as name_hit,
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
     where r.name not ilike '%(NEEDS RE-SCRAPE)%'
       and r.name not ilike '%null%'
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

-- The constraint 0028 deferred until its backfill had run. Verified 0 rows with
-- a null or blank name across 578 before applying.
alter table public.recipes
  alter column name set not null;

-- Refreshed so the comment names the migration that is actually on disk.
comment on column public.recipes.name is
  'The recipe title, and its identity in every listing. Source of truth — metadata.schema.name is a dead pre-0028 artifact. The column always existed and was always written; 0028 is what made it the thing that gets READ, and 0029 is what pointed search at it.';
