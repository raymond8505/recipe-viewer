-- 0002_ingredients
--
-- Ingredient manager — canonical ingredient catalog. Applied to the
-- recipe-viewer Supabase project via the Supabase MCP `apply_migration` tool
-- (this repo has no migration runner; this file is a checked-in record for
-- review/reproducibility).
--
-- One row per known ingredient. `nutrition` holds the per-100g core label set
-- (12 fields — see IngredientNutrition in src/types/ingredient.ts).
-- `food_portions` keeps the raw USDA foodPortions payload for audit and manual
-- density correction. `embedding` (gemini-embedding-001, 768d, stored raw /
-- un-normalized like recipes.embedding — cosine distance is scale-invariant)
-- backs semantic matching via match_ingredients() (0005).
--
-- Service-role-only: RLS enabled with no policies, same posture as `users`
-- (0001). All access goes through src/lib/ingredients.ts on
-- getSupabaseAdminClient(); the anon client cannot see this table.

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  aliases text[] not null default '{}',
  fdc_id integer,
  fdc_data_type text,
  nutrition jsonb,
  density_g_per_ml numeric,
  food_portions jsonb,
  embedding vector(768),
  source text not null default 'usda' check (source in ('usda', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Canonical names are case-insensitively unique; the normalization workflow
-- dedupes novel ingredients against this index (insert conflict -> re-match).
create unique index ingredients_name_lower_idx on public.ingredients (lower(name));

alter table public.ingredients enable row level security;
