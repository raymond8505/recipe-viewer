# Supabase Data Layer

## Select lists

**PostgREST select lists go through `selectColumns<Row>()`** (`src/lib/supabase.ts`) — never hand-write a comma-delimited column string. It compile-checks the list against the row type in both directions (unknown column rejected; missing column named in the error) and enforces write-only columns (`embedding`, `content`) by their absence from the Row type. Its return type is the joined string **literal** (template-literal `Join`) — this is load-bearing: supabase-js infers result row types by parsing the select string's literal type, and a plain `string` degrades results to `GenericStringError`, breaking single-cast `data as Row` sites.

## Repo layer, not raw table access

**Data access.** Route handlers must **not** call `getSupabaseClient().from("recipes")` directly — go through `src/lib/recipes.ts` (`getRecipeById`, `updateRecipeRow`, `archiveRecipe`, `createRecipeRow`) and map `RecipeRepoError` → 404 (`not_found`) / 500. `updateRecipeRow` **merges** the stored half of a schema patch into `metadata.schema` (not replace) — `recipeIngredient` / `recipeInstructions` instead replace their columns wholesale, see "A recipe spans two tables" — and syncs the top-level `name` column; relying on this is what keeps list/search columns from going stale. In tests, mock `@/lib/recipes` at the module boundary with `importOriginal` so `RecipeRepoError` stays real for `instanceof`. (OAuth routes still use raw `oauth_*` Supabase calls — there is no repo layer for those yet.)

## A recipe spans two tables

**`db/migrations/0016` moved ingredients and instructions out of `metadata`.** `recipes.instructions` is a straight jsonb mirror of `recipeInstructions`. `recipes.ingredients` is **not** a mirror — it is an ordered array of group objects holding bare `recipe_ingredients.id` values:

```jsonc
[ { "name": "Meatballs", "ingredients": ["<uuid>", "<uuid>"] },
  { "ingredients": ["<uuid>"] } ]   // ungrouped: the `name` key is ABSENT
```

A line's **position is its index** in those arrays and its **identity is the row it names**. The line *text* lives only on `recipe_ingredients.raw_text`, so a `recipes` row alone cannot render an ingredient list — and a bug that loses those rows now loses recipe content, not just derived nutrition data.

**Three types, one table.** `RecipeRowColumns` is the table column-for-column and is what `selectColumns<>` is checked against; `RecipeRow` extends it with `ingredientRows` (hydrated from the second table, never selected); `StoredRecipeSchema` is `SchemaRecipe` minus the two fields that are now columns, and is what `metadata.schema` holds.

**Never read the two fields off `metadata.schema`.** `composeRecipeSchema(row)` in `src/lib/recipeSchema.ts` is the single place that reassembles a whole `SchemaRecipe` — it is pure and client-safe (RecipeDetail and CookingMode both need it; `src/lib/recipes.ts` can't be imported from a client component because it reaches `@/env`). It returns a **fresh object every call**, so a component holding one in state must memoize a single instance per row rather than re-composing inside a reference comparison.

**Wire contracts are unchanged.** MCP tools and `/api/recipes/[id]/update` still send and receive a whole `SchemaRecipe`; `reconcileRecipeIngredients` (`src/lib/recipeIngredientReconcile.ts`) does the splitting. It is pure, and it mints row ids **before** any write because the group array must reference them — PostgREST does not promise to return bulk-inserted rows in the order they were sent.

**The write order is load-bearing.** There is no transaction (PostgREST gives one statement per request), so `updateRecipeRow` goes: insert new rows → update reworded rows → **write the `recipes` row (the commit point)** → delete dropped rows. A crash before the third step leaves unreferenced rows; a crash after it leaves orphans. Both are invisible to readers and prunable — neither loses anything anyone can see. Changing this order breaks that property.

**Derived `content` + `embedding` columns.** Both write helpers (`createRecipeRow`, `updateRecipeRow`) derive two columns from the `SchemaRecipe` so the MCP and UI paths produce them identically:
- **`content`** (NOT NULL) is the full markdown rendering of the recipe via `schemaToMarkdown` — recomputed on every create and on any schema-touching update. (This is also the exact text that gets embedded.)
- **`embedding`** (nullable `vector(768)`) is a best-effort Gemini embedding of that markdown via `generateEmbedding`. If generation returns `null` (e.g. Google is down) the write still succeeds — the column is omitted on insert and the prior vector is left untouched on update; it is never nulled.
- Embeddings are stored **raw (un-normalized)**: they're queried with pgvector cosine distance (`<=>`), which is scale-invariant, so normalizing would be a no-op and would also split the column's scale from the older n8n-written rows.
- Neither column is in `RECIPE_COLUMNS`, so both are **write-only** — not read back onto `RecipeRow`.
- `content` is rendered from the **composed** schema, so a patch that touches only ingredients still has to reassemble the rest to render it.

## Migrations

**Migration records in `db/migrations/` are applied out-of-band** via Supabase MCP `apply_migration` (project `xonkmdhnjpjkapnsmltu`); 0006+ show up in the project's migrations table, 0002–0005 predate that and don't — check `information_schema` for actual state, not the migrations list.
