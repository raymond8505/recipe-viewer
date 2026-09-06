# Supabase Data Layer

## Select lists

**PostgREST select lists go through `selectColumns<Row>()`** (`src/lib/supabase.ts`) — never hand-write a comma-delimited column string. It compile-checks the list against the row type in both directions (unknown column rejected; missing column named in the error) and enforces write-only columns (`embedding`, `content`) by their absence from the Row type. Its return type is the joined string **literal** (template-literal `Join`) — this is load-bearing: supabase-js infers result row types by parsing the select string's literal type, and a plain `string` degrades results to `GenericStringError`, breaking single-cast `data as Row` sites.

## Repo layer, not raw table access

**Data access.** Route handlers must **not** call `getSupabaseClient().from("recipes")` directly — go through `src/lib/recipes.ts` (`getRecipeById`, `updateRecipeRow`, `archiveRecipe`, `createRecipeRow`) and map `RecipeRepoError` → 404 (`not_found`) / 500. `updateRecipeRow` **merges** the schema patch into `metadata.schema` (not replace) and syncs the top-level `name` column — relying on this is what keeps list/search columns from going stale. In tests, mock `@/lib/recipes` at the module boundary with `importOriginal` so `RecipeRepoError` stays real for `instanceof`. (OAuth routes still use raw `oauth_*` Supabase calls — there is no repo layer for those yet.)

**Derived `content` + `embedding` columns.** Both write helpers (`createRecipeRow`, `updateRecipeRow`) derive two columns from the `SchemaRecipe` so the MCP and UI paths produce them identically:
- **`content`** (NOT NULL) is the full markdown rendering of the recipe via `schemaToMarkdown` — recomputed on every create and on any schema-touching update. (This is also the exact text that gets embedded.)
- **`embedding`** (nullable `vector(768)`) is a best-effort Gemini embedding of that markdown via `generateEmbedding`. If generation returns `null` (e.g. Google is down) the write still succeeds — the column is omitted on insert and the prior vector is left untouched on update; it is never nulled.
- Embeddings are stored **raw (un-normalized)**: they're queried with pgvector cosine distance (`<=>`), which is scale-invariant, so normalizing would be a no-op and would also split the column's scale from the older n8n-written rows.
- Neither column is in `RECIPE_COLUMNS`, so both are **write-only** — not read back onto `RecipeRow`.

## Promoted time columns — the hydrate/extract seam

**`recipes.prep_time` / `cook_time` / `total_time` (integer SECONDS, nullable) are the source of truth for a recipe's times** (0019, re-based to seconds in 0020). The copies still sitting in `metadata.schema.{prepTime,cookTime,totalTime}` are **dead artifacts** — unlike 0016's rollout, no migration ever strips them, and nothing may read or write them again.

What makes that safe is one seam in `src/lib/recipes.ts`:
- **`hydrateTimes`** runs at every read exit (list query, `getRecipeById`, and the row returned by both write helpers) and overwrites the schema's three time keys from the columns. A NULL column *deletes* the key rather than setting null, so a hydrated schema is indistinguishable from one that never had the time.
- **`stripTimes`** removes them from every blob written, so the artifact never gains a fresh value. `schemaToMarkdown` is still handed the times-bearing schema — the columns are where times *land*, not a reason for the embedded text to stop mentioning them.

So `row.metadata.schema.prepTime` is a **hydrated view**, not the stored blob, and every consumer above the repo layer (JSON-LD, MCP tools, `RecipeCard`, `RecipeDetail`, `CookingMode`) keeps speaking `SchemaRecipe` unchanged. **The corollary is the thing to protect: a reader that queries `recipes` without coming through the repo layer gets a pre-0019 answer, silently.**

`updateRecipeRow` hydrates `current` *before* merging the schema patch, which is what makes three-way semantics fall out of the plain spread — an absent key inherits the column, an explicit `null` clears it, an ISO string sets it. `SchemaRecipe`'s three time fields are `string | null` for that middle case: `undefined` disappears in JSON, so a cleared field would otherwise read as "absent, leave it alone" after the round trip.

Conversions live in `src/lib/format.ts` — never re-derive them. The ISO → column direction is just `parseDurationToSeconds`, which already existed; the return trip is `secondsToIso` / `formatSeconds`. `isIsoDuration` answers the *syntax* question separately, because `"PT0M"` (a no-cook recipe saying so) and `"P4D"` (a duration we can't read) both parse to `null` and only the second is a value being dropped.

**The editor is HH:MM, which is coarser than the column** — `formatTimeInput` / `parseTimeInput` / `canonicalizeTimeInput`. `formatTimeInput` rounds to the nearest minute, so a stored value carrying seconds is rewritten if that recipe is ever edited. Two values in the whole recipe set are affected; the asymmetry is deliberate (a recipe time is written in hours and minutes) and recorded on the function.

## Migrations

**Migration records in `db/migrations/` are applied out-of-band** via Supabase MCP `apply_migration` (project `xonkmdhnjpjkapnsmltu`); 0006+ show up in the project's migrations table, 0002–0005 predate that and don't — check `information_schema` for actual state, not the migrations list.
