-- 0003_recipe_ingredients
--
-- Ingredient manager — per-recipe parsed ingredient lines. Applied via the
-- Supabase MCP `apply_migration` tool (checked-in record only; see 0002).
--
-- The structured layer the normalization workflow derives from
-- SchemaRecipe.recipeIngredient. The recipe's schema stays the display source
-- of truth — these rows never feed back into recipe text. Rows are replaced
-- wholesale per recipe on each normalization run (delete-then-insert), so
-- there is no updated_at.
--
-- `unit` is a UNIT_DEFS key from src/lib/units.ts (or null for count/unitless
-- lines) — deliberately text, not an enum, so the vocabulary can evolve in
-- code. `ingredient_id` is null for unmatched lines and nulls out (not
-- cascades) if the referenced ingredient is deleted.
--
-- Service-role-only: RLS enabled with no policies (see 0002).

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  raw_text text not null,
  quantity numeric,
  unit text,
  name_text text not null,
  note text,
  match_status text not null check (match_status in ('matched', 'novel', 'unmatched', 'manual')),
  confidence numeric,
  position integer not null,
  created_at timestamptz not null default now(),
  unique (recipe_id, position)
);

create index recipe_ingredients_ingredient_id_idx
  on public.recipe_ingredients (ingredient_id);

alter table public.recipe_ingredients enable row level security;
