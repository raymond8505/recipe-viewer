# Supabase Data Layer

## Select lists

**PostgREST select lists go through `selectColumns<Row>()`** (`src/lib/supabase.ts`) — never hand-write a comma-delimited column string. It compile-checks the list against the row type in both directions (unknown column rejected; missing column named in the error) and enforces write-only columns (`embedding`, `content`) by their absence from the Row type. Its return type is the joined string **literal** (template-literal `Join`) — this is load-bearing: supabase-js infers result row types by parsing the select string's literal type, and a plain `string` degrades results to `GenericStringError`, breaking single-cast `data as Row` sites.

## Repo layer, not raw table access

**Data access.** Route handlers must **not** call `getSupabaseClient().from("recipes")` directly — go through `src/lib/recipes.ts` (`getRecipeById`, `updateRecipeRow`, `archiveRecipe`, `createRecipeRow`) and map `RecipeRepoError` → 404 (`not_found`) / 500. `updateRecipeRow` **merges** the schema patch into `metadata.schema` (not replace), **replaces** the ingredient list when `ingredients` is given (see below), and syncs the top-level `name` column — relying on this is what keeps list/search columns from going stale. In tests, mock `@/lib/recipes` at the module boundary with `importOriginal` so `RecipeRepoError` stays real for `instanceof`. (OAuth routes still use raw `oauth_*` Supabase calls — there is no repo layer for those yet.)

**Derived `content` + `embedding` columns.** Both write helpers (`createRecipeRow`, `updateRecipeRow`) derive two columns from the recipe so the MCP and UI paths produce them identically:
- **`content`** (NOT NULL) is the full markdown rendering of the recipe via `recipeToMarkdown(schema, ingredients)` — recomputed on every create and on any update that touches the schema or the ingredients. (This is also the exact text that gets embedded.)
- **`embedding`** (nullable `vector(768)`) is a best-effort Gemini embedding of that markdown via `generateEmbedding`. If generation returns `null` (e.g. Google is down) the write still succeeds — the column is omitted on insert and the prior vector is left untouched on update; it is never nulled.
- Embeddings are stored **raw (un-normalized)**: they're queried with pgvector cosine distance (`<=>`), which is scale-invariant, so normalizing would be a no-op and would also split the column's scale from the older n8n-written rows.
- Neither column is in `RECIPE_COLUMNS`, so both are **write-only** — not read back onto `RecipeRow`.

## Promoted ingredients — `recipes.ingredients` + `recipe_ingredients`

**A recipe's ingredient list spans two tables** (0016). `recipes.ingredients` (jsonb, NOT NULL, default `[]`) is an ordered array of group objects holding bare `recipe_ingredients.id` values — `StoredIngredientGroup`:

```jsonc
[ { "name": "Meatballs", "ingredients": ["<uuid>", "<uuid>"] },
  { "ingredients": ["<uuid>"] } ]   // ungrouped: the `name` key is ABSENT
```

A line's **position is its index** in those arrays and its **identity is the row it names**; the line's text is `recipe_ingredients.raw_text`. A `recipes` row alone cannot render an ingredient list, and a bug that loses rows loses recipe content, not derived data.

**Three types, one table.** `RecipeRowColumns` is the table column-for-column (`ingredients: StoredIngredientGroup[]`) and is what `selectColumns<>` is checked against; `RecipeRow` is the same row with `ingredients: RecipeIngredientGroup[]` **hydrated** — each id resolved to its row, carried as a `RecipeIngredient` entity (the row minus `recipe_id`, plus `ingredient`, its catalog row). `RecipeIngredientRow` omits `line_id` and `position` on purpose: both columns exist, dead (`position` takes its default, `line_id` stays null), and `selectColumns` being exhaustive over the type is what keeps them unreachable.

**The read exit — `hydrate` in `src/lib/recipes.ts`** — is the one place a `RecipeRow` is built: times from their columns, groups from the column joined to the rows, and the blob's frozen `recipeIngredient` key **deleted**. That key sits in every pre-0016 row at its 2026-09 backfill value; nothing strips it in the database (same precedent as the times), so the read exit is what keeps it from reaching a consumer — the MCP server JSON-stringifies whole rows. Every write strips it too (`stripIngredientKey`, beside `stripTimes`), because the zod schema is `.passthrough()` and an agent can still send it.
- `getRecipeById` hydrates rows **and** the catalog (`getCatalogForRows`): each line's `ingredient` is the `IngredientRow` or `null`.
- `getRecipes` hydrates rows in one batched query per page (`getRecipeIngredientsByRecipeIds`, chunked by 100 ids for the PostgREST URL limit — `getIngredientsByIds` chunks on the same `ID_CHUNK`). The rows are not optional — `/api/recipes` feeds MealSearch, whose rows go straight into a `ScalableRecipe` when a recipe joins a meal.
- **The catalog is opt-in on the list query: `getRecipes({ catalog: true })`.** It costs one more round trip for the *page* (every line on it, deduped by ingredient id — never one per recipe), and the home page pays it so the cards can carry nutrition badges. Without it `ingredient` is left **undefined**, and `computeRecipeNutrition` treats undefined and null alike, so an opted-out row reports no nutrition rather than a total undercounted by the lines it couldn't see. `/api/recipes` and MCP `search_recipes` render recipe text only and stay opted out.
- An id no row answers to is **skipped**: the recipe renders one line short, and the next save repairs it. That state is reachable (see the write order), so throwing would take the page down over it.

**Writes go through `reconcileRecipeIngredients`** (`src/lib/recipeIngredientReconcile.ts`, pure, tested without a database). Input is `RecipeIngredientGroupInput[]` — groups of `{ id?, raw_text }`. A line keeps its row by naming its id (only THIS recipe's rows count; each row is claimed once); a line with no usable id claims an unclaimed row with identical text (a re-scrape or an MCP create carries no ids, and recreating every row would drop every curated catalog match); whatever is left is a new row, its id minted **before** any write because the column must name it and PostgREST does not promise bulk-insert order. A kept row with new text is re-parsed (`parseLineDeterministic`), dropping `estimated_grams` only when quantity/unit moved. `lineSetChanged` (an insert or a delete) is the only thing that schedules normalization.

**The write order is load-bearing.** PostgREST gives one statement per request and there is no transaction, so `updateRecipeRow` goes: insert new rows → update reworded rows → **write the `recipes` row (the commit point: the column is the index)** → delete dropped rows (best-effort; a prune failure is logged, never fails the save). A crash before the third step leaves unreferenced rows; after it, orphans. Both are invisible to readers and prunable. `createRecipeRow` inserts the recipe row **first** because the ingredient rows reference it (FK), with the column already naming the minted ids; a failure between the two renders the recipe short those lines. A SQL function taking the whole reconcile is the upgrade path if this ever needs to be atomic.

**Normalization only updates rows** (`updateRecipeIngredientRows`, an upsert on the primary key): it never creates or prunes, because the reconcile owns the row set. A row the reconcile dropped mid-run is simply absent from the ids the run carries.

**Nothing outside the app reads the blob.** The RPCs that once handed `metadata->'schema'` to n8n are dropped (0018) — agent search goes through the MCP `search_recipes` tool. Anything that queries the blob directly gets the frozen copy, so don't add such a reader.

## Promoted time columns — the hydrate/extract seam

**`recipes.prep_time` / `cook_time` / `total_time` (integer SECONDS, nullable) are the source of truth for a recipe's times** (0019, re-based to seconds in 0020). The copies still sitting in `metadata.schema.{prepTime,cookTime,totalTime}` are **dead artifacts** — no migration strips them, and nothing may read or write them again.

What makes that safe is one seam in `src/lib/recipes.ts`:
- **`hydrateTimes`** runs inside `hydrate` at every read exit (list query, `getRecipeById`, and the row returned by both write helpers) and overwrites the schema's three time keys from the columns. A NULL column *deletes* the key rather than setting null, so a hydrated schema is indistinguishable from one that never had the time.
- **`stripTimes`** removes them from every blob written, so the artifact never gains a fresh value. `recipeToMarkdown` is still handed the times-bearing schema — the columns are where times *land*, not a reason for the embedded text to stop mentioning them.

So `row.metadata.schema.prepTime` is a **hydrated view**, not the stored blob, and every consumer above the repo layer (JSON-LD, MCP tools, `RecipeCard`, `RecipeDetail`, `CookingMode`) keeps speaking `SchemaRecipe` unchanged. **The corollary is the thing to protect: a reader that queries `recipes` without coming through the repo layer gets a pre-0019 answer and no ingredients, silently.**

`updateRecipeRow` hydrates `current` *before* merging the schema patch, which is what makes three-way semantics fall out of the plain spread — an absent key inherits the column, an explicit `null` clears it, an ISO string sets it. `SchemaRecipe`'s three time fields are `string | null` for that middle case: `undefined` disappears in JSON, so a cleared field would otherwise read as "absent, leave it alone" after the round trip.

Conversions live in `src/lib/format.ts` — never re-derive them. The ISO → column direction is just `parseDurationToSeconds`, which already existed; the return trip is `secondsToIso` / `formatSeconds`. `isIsoDuration` answers the *syntax* question separately, because `"PT0M"` (a no-cook recipe saying so) and `"P4D"` (a duration we can't read) both parse to `null` and only the second is a value being dropped.

**The editor is HH:MM, which is coarser than the column** — `formatTimeInput` / `parseTimeInput` / `canonicalizeTimeInput`. `formatTimeInput` rounds to the nearest minute, so a stored value carrying seconds is rewritten if that recipe is ever edited. Two values in the whole recipe set are affected; the asymmetry is deliberate (a recipe time is written in hours and minutes) and recorded on the function.

## Migrations

**Migration records in `db/migrations/` are applied out-of-band** via Supabase MCP `apply_migration` (project `xonkmdhnjpjkapnsmltu`); 0006+ show up in the project's migrations table, 0002–0005 predate that and don't — check `information_schema` for actual state, not the migrations list. 0016/0017 are applied (as `recipes_ingredients_instructions` / `recipe_ingredients_position_optional`); 0018 drops the dead `match_recipes` / `find_dinner` RPCs. `recipes.instructions` (0016) is populated but unread — instructions stay in the blob.

**`yarn sync:ingredient-columns [--dry-run] [--limit=N]`** brings a recipe's column and rows up to its blob's `recipeIngredient` — the one-shot for recipes edited through a blob-writing build after the 0016 backfill, and the last reader of the dead key. Deterministic only: new rows land unmatched; the matcher is never invoked.
