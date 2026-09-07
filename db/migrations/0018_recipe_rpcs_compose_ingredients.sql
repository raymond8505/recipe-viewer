-- 0018_recipe_rpcs_compose_ingredients
--
-- Rewrite the two n8n-facing RPCs that hand out `metadata->'schema'` so the
-- `recipeIngredient` they return is composed from `recipes.ingredients` +
-- `recipe_ingredients.raw_text`. Applied via the Supabase MCP `apply_migration`
-- tool (checked-in record only; see 0002).
--
-- Why: 0016 moved the ingredient list out of the blob, and from this build on
-- the app neither reads nor writes `metadata.schema.recipeIngredient`. The key
-- still exists on every row — frozen at whatever the 2026-09 backfill saw —
-- and nothing strips it (same precedent as the times in 0019: a dead key is
-- cheaper than a second rollout window). A consumer that reads the raw blob
-- therefore gets the recipe as it was at migration time, silently. Inside the
-- app the repo layer deletes the key at every read exit; these two functions
-- are the readers that live OUTSIDE the app, so they get the same treatment
-- here, in SQL.
--
-- The helper is SECURITY DEFINER because `recipe_ingredients` is RLS-locked
-- with no policies (0003) and `find_dinner` is not itself a definer — without
-- it the composed list would be empty for every caller but the service role.
-- `match_recipes` already was a definer; the helper makes that irrelevant.
--
-- Not in scope, deliberately: the three time keys have been column-backed
-- since 0019 and are ALSO stale in these payloads. That predates this
-- migration and is a separate decision; a future migration can fold them in
-- the same way (`|| jsonb_build_object('prepTime', …)`).
--
-- Ordering: groups in array order, lines in their group's array order — the
-- same flattening `flattenIngredients` (src/lib/recipeIngredients.ts) does, so
-- an agent reading this and an agent reading the MCP see one list.

create or replace function public.recipe_schema_with_ingredients(r public.recipes)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select (r.metadata->'schema') - 'recipeIngredient'
      || jsonb_build_object(
           'recipeIngredient',
           coalesce((
             select jsonb_agg(ri.raw_text order by g.ord, i.ord)
             from jsonb_array_elements(r.ingredients) with ordinality as g(grp, ord)
             cross join jsonb_array_elements_text(g.grp->'ingredients') with ordinality as i(id, ord)
             join public.recipe_ingredients ri on ri.id = i.id::uuid
           ), '[]'::jsonb)
         );
$$;

revoke execute on function public.recipe_schema_with_ingredients(public.recipes) from public, anon, authenticated;

create or replace function public.match_recipes(
  p_embedding vector,
  p_threshold numeric default 0.8,
  p_limit integer default 10
)
returns table(
  recipe_id uuid,
  name text,
  source text,
  url text,
  status text,
  schema jsonb,
  similarity numeric
)
language sql
stable
security definer
as $$
    select
        r.id as recipe_id,
        r.name,
        r.source,
        r.url,
        r.status,
        public.recipe_schema_with_ingredients(r) as schema,
        1 - (r.embedding <=> p_embedding) as similarity
    from recipes r
    where 1 - (r.embedding <=> p_embedding) >= p_threshold
    order by r.embedding <=> p_embedding asc
    limit p_limit;
$$;

-- Body identical to the pre-0018 definition except for the returned `recipe`
-- jsonb: the raw `ingredients` id array is dropped alongside `embedding` and
-- `metadata` (it means nothing without the rows), and `schema` is composed.
create or replace function public.find_dinner(
  win_counts jsonb,
  exclude_id uuid,
  result_count integer default 3,
  filter_status recipe_status default null
)
returns table(similarity double precision, recipe jsonb)
language plpgsql
as $$
declare
  candidate_arr embedding_entry[];
  winner_arr embedding_entry[];
  count_arr int[];
begin
  select array_agg(row(r.id, r.embedding)::embedding_entry)
    into candidate_arr
    from recipes r
   where r.embedding is not null
     and (filter_status is null or r.status = filter_status)
     and r.id != exclude_id;

  select array_agg(row(r.id, r.embedding)::embedding_entry order by k.ordinality),
         array_agg((win_counts->>(r.id::text))::int order by k.ordinality)
    into winner_arr, count_arr
    from jsonb_object_keys(win_counts) with ordinality as k(key, ordinality)
    join recipes r on r.id = k.key::uuid
   where r.embedding is not null;

  return query
    select fs.similarity,
           (to_jsonb(r) - 'embedding' - 'metadata' - 'ingredients')
             || jsonb_build_object('schema', public.recipe_schema_with_ingredients(r))
      from find_similar(candidate_arr, winner_arr, count_arr, exclude_id, result_count) fs
      join recipes r on r.id = fs.id;
end;
$$;
