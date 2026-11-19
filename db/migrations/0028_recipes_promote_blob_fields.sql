-- 0028_recipes_promote_blob_fields
--
-- Promote a recipe's image, description, notes and cooking notes out of the
-- `metadata` JSONB blob into top-level columns, and make the long-existing
-- `name` column the source of truth it was always written as. Applied via the
-- Supabase MCP `apply_migration` tool (checked-in record only; see 0002).
--
-- Why: after 0016/0019/0021/0022 the blob was down to a handful of keys, and
-- every one promoted here is a plain scalar the app reads on nearly every
-- render — a card reads name + image + description, a detail page adds notes,
-- cooking mode adds cooking notes. None of them was ever a Schema.org concern
-- in the way `recipeYield` was; they sat in a Schema.org blob only because the
-- blob is where a scraped recipe originally landed whole.
--
-- NAME IS NOT A NEW COLUMN. `recipes.name` predates the checked-in migrations
-- and the app has written it on every create and every schema patch that
-- touches the name (src/lib/recipes.ts) — but nothing ever READ it. Search,
-- both name sorts, the two junk-name guards and the ranked-search RPC all went
-- to `metadata->'schema'->>'name'`. So this migration's job for `name` is to
-- reconcile the two and then constrain the column, not to create it.
--
--   At the time of writing: 578 rows, 1 divergent, 0 null/blank names.
--
-- The single divergent row (Mediterranean Stuffed Peppers, an instagram.com
-- scrape) has a GOOD column name and a NULL blob name — the opposite of the
-- assumed direction, which is why the backfill script coalesces (blob first,
-- column kept when the blob says nothing) instead of copying the blob over the
-- column. That row is also invisible in the app today: a NULL blob name makes
-- `not ilike '%null%'` evaluate to NULL, which drops the row from every listing.
-- Reading the column is what surfaces it again.
--
-- NOT NULL on name is deliberately NOT here — it is 0029, after the backfill.
-- A row whose name lives only in the blob would fail the constraint on the way
-- in, and the script that would have fixed it runs between the two migrations.
-- (No such row exists today, but the replay order has to be correct on its own.)
--
-- IMAGE IS A SINGLE URL, not the `string | string[]` the Schema.org form
-- allows. Schema.org lets `image` be an array and the zod schema still accepts
-- one inbound, but the app has only ever rendered the first entry
-- (`getFirstImage`, src/lib/format.ts) and only ever WRITTEN a single URL —
-- 0 of 578 rows hold an array. So the array is a wire shape, reduced at the
-- inbound edge exactly like `recipeYield`, and the column holds what the app
-- actually uses. A text column, not a URL type: these are Supabase Storage
-- public URLs, occasionally an external one, and Postgres has nothing to check.
--
-- COOKING_NOTES IS SNAKE_CASE while the blob key was `cookingNotes`, matching
-- every other column here; the wire shapes that already say `cookingNotes`
-- (the /api/recipes/[id]/notes body, the MCP clear_cooking_notes tool) keep
-- saying it and the repo layer maps. `notes` and `cooking_notes` are two
-- different things and both are kept: `notes` is recipe-level annotation the
-- author writes in the editor, `cooking_notes` is what a cook types in cooking
-- mode against a specific cook of it, and MCP treats the second as read-only.
--
-- NULLABLE, no defaults, for the reason 0019 and 0022 both gave: NULL means
-- "this recipe has none", which is a state every reader already branches on
-- (`{schema.notes && ...}`). An empty-string default would make every recipe
-- look like it has an empty note rather than no note.
--
-- NO INDEX. Both name filters are `ilike '%q%'` (`recipeSearchFilter` and the
-- two junk guards), which no btree can serve; the name sorts are an ORDER BY
-- over 578 rows. 0019 and 0022 made the same call for the same reason — add one
-- when something actually filters on an anchored value.
--
-- The blob keeps every promoted copy, DEAD from here on, and there is no
-- follow-up migration to strip them — the precedent 0019, 0021 and 0022 all
-- set. `SCHEMA_ORG_ONLY_KEYS` (src/lib/format.ts) grows to cover them, so the
-- read exit deletes them and every write strips them. The same list also gains
-- `author`, `keywords`, `datePublished` and `nutrition`, which are not promoted
-- but DELETED: the author of every recipe here is the user, keywords were never
-- read, created_at/updated_at supersede datePublished, and nutrition has been
-- derived from the ingredient catalog since the catalog existed. Their stored
-- bytes are likewise left alone.
--
-- WHAT STAYS IN THE BLOB: `recipeCuisine` and `recipeCategory`. They are the
-- input to a future tagging system's backfill, so they are deliberately not
-- promoted into columns that would have to be migrated a second time.
--
-- scripts/backfill-recipe-blob-fields.ts populates the four new columns and
-- reconciles `name`. Run it BEFORE the read switch lands — until it has, the
-- columns are empty and any reader that moved off the blob shows nothing.

alter table public.recipes
  add column if not exists image         text,
  add column if not exists description   text,
  add column if not exists notes         text,
  add column if not exists cooking_notes text;

comment on column public.recipes.name is
  'The recipe title, and its identity in every listing. Source of truth — metadata.schema.name is a dead pre-0028 artifact. The column always existed and was always written; 0028 is what made it the thing that gets READ.';

comment on column public.recipes.image is
  'Single image URL (usually Supabase Storage), or NULL for a recipe with no image. Schema.org allows image to be an array and the inbound edge still accepts one, but it is reduced to its first entry here — see getFirstImage in src/lib/format.ts.';

comment on column public.recipes.description is
  'The recipe blurb shown on the card and under the title; NULL when the source gave none.';

comment on column public.recipes.notes is
  'Recipe-level notes the author writes in the editor. App-internal — never part of the published JSON-LD, though the image webhook is handed it. Distinct from cooking_notes.';

comment on column public.recipes.cooking_notes is
  'Notes a cook types in cooking mode against this recipe. App-internal and READ-ONLY to agents: MCP create/update ignore it and clear_cooking_notes is the only agent-writable path. Distinct from notes.';
