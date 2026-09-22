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

## Search — the recipe's name OR its catalog ingredients

**`recipeSearchFilter` (`src/lib/recipes.ts`) is the only place a query becomes a filter**, and
`getRecipes` and `getStatusCounts` both go through it. They are two requests answering one screen —
the grid lists the rows, the status chips count them — so a predicate living in only one of them
would have the chips claiming a total the grid cannot produce. A test pins the two strings equal.

The second arm is **`ingredient_catalog_text`**, a PostgREST **computed field** (0023): a
`stable security definer` function over the `recipes` row returning the newline-joined catalog
`name` + `aliases` of every line that resolves to a catalog ingredient. Being a filter-only
pseudo-column, it is never selected — `RECIPE_COLUMNS` doesn't name it and `selectColumns<RecipeRowColumns>()`
stays exhaustive — so no read path changes shape.

- **A computed field, not an RPC, because ordering stays with the caller.** The user's sort
  (`newest`/`oldest`/`name-asc`/`name-desc`), `count: exact`, `.range()` and the status/source
  filters all keep working untouched, and search stays one query. An RPC returning the result set
  would have to re-implement every one of those in SQL; an RPC returning ids would put a uuid list
  in the URL, past the ~16 KB cliff `ID_CHUNK` exists for.
- **Catalog `name` + `aliases` only — never `recipe_ingredients.raw_text` or `name_text`.**
  Matching the catalog and walking back to the recipes skips unmatched lines by construction, so
  search speaks the one vocabulary a person can also browse in the ingredient manager. Aliases are
  the point: they are what lets "cilantro" find a recipe whose line reads "fresh coriander".
- **Newline-separated, never spaces.** The arm is a plain `ilike '%q%'` over the whole aggregate, so
  a space-joined blob lets a query straddle two ingredients — with "black pepper" beside
  "Salt, table", `pepper salt` matched 3 recipes containing no such phrase. A newline cannot occur
  in a search box value.
- **`.or()` values go through `orFilterValue`** (`src/lib/supabase.ts`). A bare `.ilike(col, value)`
  passes its value as its own parameter, but `.or()` takes one string in PostgREST's filter grammar
  where `,` separates the arms: an unquoted query containing one is a **400 PGRST100**, and an
  unquoted query could otherwise *construct* filter syntax against columns the app never selects.
  `%` and `_` are deliberately left alone — they are `ilike` wildcards on either side of the move.
- **The function is granted to `anon`**, unlike every other function here, because `getRecipes` runs
  on the anon client and `GET /api/recipes` is public-read; `SECURITY DEFINER` is what lets it read
  the RLS-locked ingredient tables. It returns text only — no ids, no nutrition — and only for
  ingredients reachable through a recipe's own lines, so it cannot page the catalog itself.
- **Reach is a function of normalization coverage** — see [nutrition.md](nutrition.md).

**Ranking — `sort: "relevance"` goes through SQL, everything else does not.** A search defaults to
relevance (`defaultSortFor`, src/lib/format.ts), which orders a match by how much of the recipe it
accounts for by weight, so 454 g of ground beef outranks an 11 g bouillon cube. That order depends
on the QUERY, and PostgREST can only order by something the row already holds — so
`search_recipes_ranked` (0025) owns the filtering, the ordering, the paging and the exact count for
that one case. `getRecipes` keeps its plain PostgREST query for browsing and for any search where
the reader picked an explicit sort.

- **The RPC returns ids, not rows.** `getRecipes` re-reads them through the same
  `selectColumns<RecipeRowColumns>()` select every other read uses, so the typed column list stays
  the one description of a recipe row and the function needs no edit when a column is added. `.in()`
  carries one page of ids, nowhere near the URL limit. `.in()` does not preserve order, so the
  ranking is re-applied from the id list.
- **A name hit scores 1.0**; anything else scores the matched lines' summed `resolved_grams` over a
  denominator — the recipe's stated `total_weight_amount` when it has one, else what its lines add
  up to. That second denominator undercounts wherever a line could not be weighed, which inflates
  the share; accepted, because the alternative is refusing to rank two thirds of the matches, and it
  sharpens as normalization fills `resolved_grams` in. A recipe with neither scores 0 and sorts last
  rather than disappearing.
- **It matches on `ingredient_catalog_text`, the same computed field `getStatusCounts` filters on**,
  so the ranked page and the status chips beside it can never describe different sets. Scoring is
  layered on top and never widens or narrows the match.
- **Ties fall back to `RELEVANCE_TIEBREAK`** (newest). Every name hit scores the same and every
  unweighable match scores 0, so without it their order would be the planner's and would shift
  between pages of one result set.


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

## Promoted instructions — `recipes.instructions`

**`recipes.instructions` (jsonb, NOT NULL, default `[]`; column 0016, shape 0021) holds `RecipeInstructionGroup[]` — the app's own shape, stored as is:**

```jsonc
[ { "steps": [ { "text": "Boil water." } ] },                                          // nameless run: the `name` key is ABSENT
  { "name": "Sauce", "steps": [ { "text": "Simmer.", "name": "Simmer", "seconds": 330 } ] } ]
```

A step has no identity and nothing joins to it, so unlike ingredients there is no second table, no id array, no reconcile and no hydrate step: `hydrate` passes the column through, and a write replaces the whole list. `RECIPE_COLUMNS` selects it on the list query too — MealSearch hands a secondary recipe straight to cooking mode, which renders its steps and seeds its timers.

- **Every write stores canonical form** (`canonicalizeInstructions`, `src/lib/recipeInstructions.ts`): text and names trimmed, blank steps and empty groups dropped, `seconds` kept only as a positive whole number beside a `name`, adjacent nameless groups merged. `createRecipeRow` and `updateRecipeRow` both apply it, so an agent's payload and the editor's draft land identically; `/update` echoes the stored list because it can differ from what was sent.
- **The blob's `recipeInstructions` is a dead key**, frozen at its pre-0021 value in older rows, exactly like `recipeIngredient`. `SCHEMA_ORG_ONLY_KEYS` in `src/lib/format.ts` names those two and `recipeYield`; `deleteDeadKeys` (`src/lib/recipes.ts`) runs in `hydrate` at every read exit and `stripSchemaOrgKeys` on every blob write (the zod schema is `.passthrough()`, so an agent can still send any of them). `nutrition.servingSize` is nested, so both functions handle it as a special case — and the copying one **clones `nutrition` before deleting**, because its top-level spread is shallow and a careless delete reaches into the caller's own payload (at the MCP create edge, the handler still owns it). The stripper lives in `format.ts` so the client-side inbound edge (`draftRecipeDocument`) and the server write path run the same one.
- `recipeToMarkdown(doc)` takes the whole `RecipeDocument` — one argument rather than a growing positional list — and renders the steps from the column into `content` — `## Instructions`, then `## <name>` per named group and `- text` per step — on every create and on any update that touches the schema, the ingredients or the instructions.

## Promoted time columns — the hydrate/extract seam

**`recipes.prep_time` / `cook_time` / `total_time` (integer SECONDS, nullable) are the source of truth for a recipe's times** (0019, re-based to seconds in 0020). The copies still sitting in `metadata.schema.{prepTime,cookTime,totalTime}` are **dead artifacts** — no migration strips them, and nothing may read or write them again.

What makes that safe is one seam in `src/lib/recipes.ts`:
- **`hydrateTimes`** runs inside `hydrate` at every read exit (list query, `getRecipeById`, and the row returned by both write helpers) and overwrites the schema's three time keys from the columns. A NULL column *deletes* the key rather than setting null, so a hydrated schema is indistinguishable from one that never had the time.
- **`stripTimes`** removes them from every blob written, so the artifact never gains a fresh value. `recipeToMarkdown` is still handed the times-bearing schema — the columns are where times *land*, not a reason for the embedded text to stop mentioning them.

So `row.metadata.schema.prepTime` is a **hydrated view**, not the stored blob, and every consumer above the repo layer (JSON-LD, MCP tools, `RecipeCard`, `RecipeDetail`, `CookingMode`) keeps speaking `SchemaRecipe` unchanged. **The corollary is the thing to protect: a reader that queries `recipes` without coming through the repo layer gets a pre-0019 answer and no ingredients, silently.**

## Promoted servings columns — no hydrate-back

**`recipes.servings_amount` / `servings_unit` / `total_weight_amount` / `total_weight_unit` (0022) are the source of truth for a recipe's serving count, what it counts, and the whole recipe's raw weight.** The copies in `metadata.schema.recipeYield` and `metadata.schema.nutrition.servingSize` are **dead artifacts** — no migration strips them, and nothing may read or write them again.

**Unlike the times, there is NO hydrate-back, and that asymmetry is the point.** `hydrateTimes` exists because `schema.prepTime` still has live readers above the repo layer; after 0022 **zero** readers of `schema.recipeYield` or `schema.nutrition.servingSize` remain, so writing them back at the read exit would recreate exactly the free-text round trip the columns replaced. Instead both keys join `SCHEMA_ORG_ONLY_KEYS` and are deleted on read / stripped on write, and the outbound Schema.org edges rebuild `recipeYield` from the columns via `schemaOrgYield`.

Conversions live in `src/lib/units.ts` and `src/lib/format.ts` — never re-derive them. Inbound is `parseYield`, which runs at exactly two edges (`draftRecipeDocument`, `createRecipeRow`) and returns null for anything it cannot read, so the columns stay NULL rather than holding a guess. Outbound are `formatServings` (display) and `schemaOrgYield` (the wire). Full rules → [recipe-schema.md](recipe-schema.md).

`updateRecipeRow` takes `servings` / `totalWeight` as `{ amount, unit? }` objects rather than four loose scalars, which gives the same three-way semantics the times have without a pair a caller can swap: the key absent leaves the columns alone, `amount: null` clears, a number sets. The write keys its "what will this row hold" reads on **presence in the write patch**, not `??` — clearing a count writes null, and `null ?? current` would silently restore the value the write is removing. A servings change also recomputes `content`, because the markdown's Yield line reads the columns.

`updateRecipeRow` hydrates `current` *before* merging the schema patch, which is what makes three-way semantics fall out of the plain spread — an absent key inherits the column, an explicit `null` clears it, an ISO string sets it. `SchemaRecipe`'s three time fields are `string | null` for that middle case: `undefined` disappears in JSON, so a cleared field would otherwise read as "absent, leave it alone" after the round trip.

Conversions live in `src/lib/format.ts` — never re-derive them. The ISO → column direction is just `parseDurationToSeconds`, which already existed; the return trip is `secondsToIso` / `formatSeconds`. `isIsoDuration` answers the *syntax* question separately, because `"PT0M"` (a no-cook recipe saying so) and `"P4D"` (a duration we can't read) both parse to `null` and only the second is a value being dropped.

**The editor is HH:MM, which is coarser than the column** — `formatTimeInput` / `parseTimeInput` / `canonicalizeTimeInput`. `formatTimeInput` rounds to the nearest minute, so a stored value carrying seconds is rewritten if that recipe is ever edited. Two values in the whole recipe set are affected; the asymmetry is deliberate (a recipe time is written in hours and minutes) and recorded on the function.

## Migrations

**Migration records in `db/migrations/` are applied out-of-band** via Supabase MCP `apply_migration` (project `xonkmdhnjpjkapnsmltu`); 0006+ show up in the project's migrations table, 0002–0005 predate that and don't — check `information_schema` for actual state, not the migrations list. 0016/0017 are applied (as `recipes_ingredients_instructions` / `recipe_ingredients_position_optional`); 0018 drops the dead `match_recipes` / `find_dinner` RPCs; 0021 is a column comment recording `recipes.instructions`' group shape — DDL only; 0023 adds the `ingredient_catalog_text` computed field that recipe search's ingredient arm filters on, 0024 the derived `recipe_ingredients.resolved_grams` it ranks by, and 0025 the `search_recipes_ranked` RPC that does the ranking (see Search above). 0026 adds `ingredients.last_checked` — nullable, no default and **no backfill**, because NULL there means "never verified against a source" and deriving one from `updated_at` would assert a check that never happened (see [nutrition.md](nutrition.md)).

**`yarn backfill:recipe-servings [--dry-run] [--limit=N]`** populates 0022's four columns from each row's `recipeYield`. It reports three buckets and guesses at none: yields it refused (columns left NULL), yields whose rendered label now differs (a collapsed range, a dropped parenthetical), and a `nutrition.servingSize` the columns cannot reconstruct. It does not refresh `content`.

**`yarn backfill:resolved-grams [--dry-run] [--limit=N]`** stamps 0024's column on the rows that
predate it, using `resolveLineGrams` — the same resolver the write path and the nutrition math use,
so the backfill cannot disagree with the runtime about what a line weighs. It guesses at nothing: a
line it cannot weigh is written NULL, and a deliberate 0 round-trips unchanged. Idempotent, so a
second pass writes nothing.

**`yarn sync:ingredient-columns [--dry-run] [--limit=N] [--id=<uuid>]`** brings a recipe's column and rows up to its blob's `recipeIngredient` — the one-shot for recipes edited through a blob-writing build after the 0016 backfill, and the last reader of the dead key. Deterministic only: new rows land unmatched; the matcher is never invoked.

**There is no instructions sync, and no code reads the blob's `recipeInstructions`.** `recipes.instructions` is the only source of a recipe's steps. A column-aware write strips the blob key, so translating blobs into the column would wipe those recipes' steps.
