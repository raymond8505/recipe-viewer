-- 0018_drop_dead_recipe_rpcs
--
-- Drop the two RPCs that hand `metadata->'schema'` to callers outside the
-- app, and the helper cluster only one of them uses. Applied via the Supabase
-- MCP `apply_migration` tool (checked-in record only; see 0002).
--
-- Why: both are dead. `match_recipes` (semantic recipe search over the
-- embedding column) served an n8n workflow that the self-hosted MCP server's
-- `search_recipes` tool replaces — every agent-facing search goes through
-- that tool now, and nothing in the app calls the RPC. `find_dinner` (a
-- preference-weighted "what should I cook" pick over `find_similar` and the
-- `embedding_entry` composite) is the remains of an abandoned feature with no
-- caller anywhere.
--
-- Why now: since 0016 the app keeps a recipe's ingredient list on
-- `recipes.ingredients` + `recipe_ingredients` and neither reads nor writes
-- `metadata.schema.recipeIngredient`. Both RPCs return the blob verbatim, so
-- from this build on they would hand out an ingredient list frozen at the
-- 2026-09 backfill. The choice was to teach them to compose the list from the
-- column or to delete them; with no callers, deleting is the honest answer.
--
-- `recipe_status` (the enum `find_dinner` filtered on) stays: it types
-- `recipes.status` and is used by `insert_recipe`. `find_similar` and
-- `embedding_entry` go because `find_dinner` is their only user.

drop function if exists public.find_dinner(jsonb, uuid, integer, public.recipe_status);
drop function if exists public.find_similar(public.embedding_entry[], public.embedding_entry[], integer[], uuid, integer);
drop type if exists public.embedding_entry;
drop function if exists public.match_recipes(vector, numeric, integer);
