-- 0004_recipes_normalization
--
-- Ingredient manager — normalization run state on recipes. Applied via the
-- Supabase MCP `apply_migration` tool (checked-in record only; see 0002).
--
-- `normalized_fingerprint` is the sha256 of the recipe's ingredient text list
-- (see src/lib/normalization/fingerprint.ts). The write-path trigger skips
-- scheduling when the fingerprint is unchanged, and a finishing run aborts if
-- the recipe's current fingerprint no longer matches its snapshot (a newer
-- save owns the result).

alter table public.recipes
  add column normalization_status text
    check (normalization_status in ('pending', 'running', 'completed', 'failed')),
  add column normalization_error text,
  add column ingredients_normalized_at timestamptz,
  add column normalized_fingerprint text;
