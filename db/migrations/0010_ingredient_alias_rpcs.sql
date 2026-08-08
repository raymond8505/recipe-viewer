-- 0010_ingredient_alias_rpcs
--
-- Ingredient manager — atomic alias accretion and pruning. Applied via the
-- Supabase MCP `apply_migration` tool (checked-in record only; see 0002).
--
-- An ingredient's `aliases` are the recipe-language names that have been
-- associated with it ("cilantro", "fresh coriander"), while `name` is the
-- canonical USDA description. Both match_ingredients (0007) and
-- search_ingredients_keyword (0008) already score best-of trigram similarity
-- over name AND each alias, so accreting recipe language here is what makes
-- colloquial lookups hit.
--
-- Why an RPC instead of a read-modify-write in src/lib/ingredients.ts: many
-- recipe lines resolve to one catalog ingredient, and normalization is
-- scheduled per recipe save via next/after() — so two runs, or a run and the
-- manual re-point route, can append to the same ingredient concurrently. A
-- read-modify-write drops one append silently and can resurrect an alias the
-- route just stripped. SELECT ... FOR UPDATE serializes them for free.
--
-- CASE IS PRESERVED. Aliases are display data: we store exactly the text we
-- received (trimmed, nothing more). Case-insensitivity is a matching concern
-- only, so it is applied at the comparison boundary — dedupe and removal fold
-- with lower(), and the embedding text is lowercased in
-- src/lib/ingredientAliases.ts. Nothing here ever lowercases what is stored.
--
-- `changed` is the caller's signal to spend a Gemini embedding call: the
-- embedding encodes name + aliases, so it only needs regenerating when the
-- array actually moved. Aliases are APPENDED, never reordered.
--
-- Execution is service-role-only, like every other function here.

create or replace function public.ingredient_add_aliases(
  p_id uuid,
  p_aliases text[]
)
returns table (id uuid, name text, aliases text[], changed boolean)
language plpgsql
volatile
set search_path = public
as $$
declare
  v_name    text;
  v_aliases text[];
  v_alias   text;
  v_changed boolean := false;
begin
  select i.name, i.aliases
    into v_name, v_aliases
    from public.ingredients i
   where i.id = p_id
     for update;

  -- Ingredient deleted mid-flight: return zero rows rather than raising. The
  -- caller treats "no row" as "nothing to do", not as an error — alias upkeep
  -- must never fail a normalization run whose rows are already committed.
  if not found then
    return;
  end if;

  foreach v_alias in array coalesce(p_aliases, '{}'::text[]) loop
    v_alias := btrim(v_alias);
    continue when v_alias = '';
    -- The canonical name is never also an alias.
    continue when lower(v_alias) = lower(v_name);
    continue when exists (
      select 1 from unnest(v_aliases) a where lower(a) = lower(v_alias)
    );
    -- Appended with the caller's own casing — the fold above is only a
    -- comparison.
    v_aliases := array_append(v_aliases, v_alias);
    v_changed := true;
  end loop;

  if v_changed then
    update public.ingredients
       set aliases = v_aliases, updated_at = now()
     where public.ingredients.id = p_id;
  end if;

  return query select p_id, v_name, v_aliases, v_changed;
end;
$$;

-- Drop an alias, whatever its stored casing. Unconditional: the only caller is
-- an explicit user re-point/un-link, which is a statement that this recipe
-- wording does not mean this ingredient. No reference counting — automated
-- re-matching deliberately never prunes.
create or replace function public.ingredient_remove_alias(
  p_id uuid,
  p_alias text
)
returns table (id uuid, name text, aliases text[], changed boolean)
language plpgsql
volatile
set search_path = public
as $$
declare
  v_name    text;
  v_aliases text[];
  v_new     text[];
begin
  select i.name, i.aliases
    into v_name, v_aliases
    from public.ingredients i
   where i.id = p_id
     for update;

  if not found then
    return;
  end if;

  -- WITH ORDINALITY keeps the surviving aliases in their original order.
  select coalesce(array_agg(a order by ord), '{}'::text[])
    into v_new
    from unnest(v_aliases) with ordinality as t(a, ord)
   where lower(a) <> lower(btrim(p_alias));

  if v_new is distinct from v_aliases then
    update public.ingredients
       set aliases = v_new, updated_at = now()
     where public.ingredients.id = p_id;
    return query select p_id, v_name, v_new, true;
  else
    return query select p_id, v_name, v_aliases, false;
  end if;
end;
$$;

revoke execute on function public.ingredient_add_aliases(uuid, text[])
  from public, anon, authenticated;
revoke execute on function public.ingredient_remove_alias(uuid, text)
  from public, anon, authenticated;
