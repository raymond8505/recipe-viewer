-- 0023_recipe_ingredient_catalog_text
--
-- Recipe search matches the recipe's ingredients, not just its name. Applied
-- via the Supabase MCP `apply_migration` tool (checked-in record only; see
-- 0002).
--
-- Exposed as a PostgREST *computed field* on `recipes` rather than an RPC, so
-- search stays a single query: `getRecipes` keeps its `count: exact`,
-- `.range()`, `.order()` and status/source filters, and adds one more arm to
-- its filter. The alternative — an RPC returning matching recipe ids fed back
-- as `id.in.(...)` — puts a uuid list in the URL, and PostgREST drops the
-- connection above ~16 KB without a status code (see ID_CHUNK in
-- src/lib/ingredients.ts).
--
-- The join is INNER on purpose: a line with no `ingredient_id` contributes
-- nothing, so search reaches a recipe only through the catalog's controlled
-- vocabulary. That is the point of matching the catalog rather than the line
-- text — an unmatched line has no agreed name to search, and skipping it here
-- costs nothing that normalization won't later supply. A recipe with no
-- matched lines yields NULL, and `NULL ilike '%q%'` is NULL (falsy), so it
-- correctly fails this arm and can still match on its name.
--
-- NEWLINE-separated, never spaces. The caller's arm is a plain `ilike '%q%'`
-- over whatever this returns, so a space-joined blob lets a query straddle two
-- ingredients: with "black pepper" beside "Salt, table", the query "pepper
-- salt" matched 3 recipes that contain no such phrase. A newline cannot occur
-- in a search box value, so it is a boundary no query can cross. Aliases are
-- separated from their own name for the same reason.
--
-- Cost is a correlated subquery per candidate row, carried by the
-- (recipe_id, line_id) index: measured 12-21 ms over 578 recipes / 6,493
-- lines, faster than the hoisted-EXISTS form. If the corpus grows an order of
-- magnitude, the upgrade path is a trigram GIN index on the catalog columns or
-- a maintained search column, not a different query shape.
--
-- AUTHORIZATION (this is the one function in this database granted to anon).
-- Who may call it: anyone. `getRecipes` runs on the publishable/anon client
-- and `GET /api/recipes` is public-read, so the grant is required for search
-- to work logged out. What credential proves it: none, matching the `recipes`
-- table it filters, which has RLS disabled. What an anonymous caller gets:
-- per recipe, the catalog names and aliases of that recipe's matched
-- ingredients -- SECURITY DEFINER is needed because `ingredients` and
-- `recipe_ingredients` are RLS-locked with no policies. Ingredient line text
-- is already public (the home page server-renders it; /api/recipes returns
-- it), and catalog names already reach the browser wherever `catalog: true`
-- is read. Catalog ALIASES are genuinely newly reachable: enumerating every
-- recipe would reconstruct the catalog's alias vocabulary. Accepted -- they
-- are food words ("cilantro", "fresh coriander") derived from public recipe
-- text, carrying no user data. The signature is scoped to keep it that way:
-- text only, no ids and no nutrition, and only for ingredients reachable
-- through a recipe's own lines, so it can never page the catalog itself.

create function public.ingredient_catalog_text(r public.recipes)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select string_agg(
           concat_ws(E'
', i.name, array_to_string(i.aliases, E'
')),
           E'
'
         )
  from public.recipe_ingredients ri
  join public.ingredients i on i.id = ri.ingredient_id
  where ri.recipe_id = r.id;
$$;

grant execute on function public.ingredient_catalog_text(public.recipes)
  to anon, authenticated;
