-- 0006_ingredients_embedding_not_null
--
-- Ingredient manager — require an embedding on every catalog ingredient.
-- Applied via the Supabase MCP `apply_migration` tool (checked-in record
-- only; see 0002).
--
-- PR #40 review: embeddings are what make an ingredient matchable via
-- match_ingredients(); an embedding-less row would be silently invisible to
-- matching and every line resolving to it would be misclassified as novel.
-- Enforced at the column level (not just the repo layer) so no write path
-- can mint an unmatchable ingredient.
--
-- Safe without a backfill: the table is empty at apply time (verified
-- 2026-07-14 — the catalog has no production rows yet).

alter table public.ingredients
  alter column embedding set not null;
