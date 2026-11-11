-- 0026_ingredients_last_checked
--
-- When a catalog row's data was last verified against a source. Applied via the
-- Supabase MCP `apply_migration` tool (checked-in record only; see 0002).
--
-- NOT `updated_at`. That column moves on every write — a rename, an alias the
-- matcher taught the row, a typo fix — so it answers "when did this row last
-- change", which is a different question from "when did someone last confirm it
-- is right". Sweeping the catalog for stale nutrition needs the second answer,
-- and no existing column gives it.
--
-- ASSERTED, NOT DERIVED — the opposite of 0024's resolved_grams. Nothing can
-- compute "a human or an agent checked this against USDA or a package label",
-- so the value is only ever what a caller stamps: `update_ingredient` takes it
-- as an explicit ISO timestamp (an agent that has just finished a consensus
-- check passes the current time), and the ingredient manager's "Mark checked"
-- button PATCHes now(). A plain row save deliberately does NOT stamp it —
-- people edit rows for reasons that are not checks, so the stamp stays a
-- separate, deliberate act.
--
-- Readable, so unlike `embedding` it IS on IngredientRow and in
-- INGREDIENT_COLUMNS (src/lib/ingredients.ts); the ingredients table renders it.
--
-- NULL means "never checked", which is true of every row that exists today —
-- hence no default and no backfill. Backfilling from updated_at would assert a
-- check that never happened, which is the one thing this column must not do.

alter table public.ingredients
  add column if not exists last_checked timestamptz;

comment on column public.ingredients.last_checked is
  'When this row''s data was last verified against a source (USDA, a package label, a consensus check). Caller-asserted, never derived: stamped by MCP update_ingredient or the ingredient manager''s "Mark checked" button, never by an ordinary save. Distinct from updated_at, which moves on any write. NULL = never checked.';
