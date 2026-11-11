# Supabase Data Layer

## Select lists

**PostgREST select lists go through `selectColumns<Row>()`** (`src/lib/supabase.ts`) — never hand-write a comma-delimited column string. It compile-checks the list against the row type in both directions (unknown column rejected; missing column named in the error) and enforces write-only columns (`embedding`, `content`) by their absence from the Row type. Its return type is the joined string **literal** (template-literal `Join`) — this is load-bearing: supabase-js infers result row types by parsing the select string's literal type, and a plain `string` degrades results to `GenericStringError`, breaking single-cast `data as Row` sites.

## Repo layer, not raw table access

**Data access.** Route handlers must **not** call `getSupabaseClient().from("recipes")` directly — go through `src/lib/recipes.ts` (`getRecipeById`, `updateRecipeRow`, `archiveRecipe`, `createRecipeRow`) and map `RecipeRepoError` → 404 (`not_found`) / 500. `updateRecipeRow` takes the column-backed scalars as top-level patch fields (`name`, `image`, `description`, `notes`, `cookingNotes`, `servings`, `totalWeight`, `times`), **merges** any `schema` patch into `metadata.schema` (not replace — and that blob is down to `recipeCuisine` / `recipeCategory`), and **replaces** the ingredient list when `ingredients` is given (see below). In tests, mock `@/lib/recipes` at the module boundary with `importOriginal` so `RecipeRepoError` stays real for `instanceof`. (OAuth routes still use raw `oauth_*` Supabase calls — there is no repo layer for those yet.)

**Derived `content` + `embedding` columns.** Both write helpers (`createRecipeRow`, `updateRecipeRow`) derive two columns from the recipe so the MCP and UI paths produce them identically:
- **`content`** (NOT NULL) is the full markdown rendering of the recipe via `recipeToMarkdown(schema, ingredients)` — recomputed on every create and on any update that touches the schema or the ingredients. (This is also the exact text that gets embedded.)
- **`embedding`** (nullable `vector(768)`) is a best-effort Gemini embedding of that markdown via `generateEmbedding`. If generation returns `null` (e.g. Google is down) the write still succeeds — the column is omitted on insert and the prior vector is left untouched on update; it is never nulled.
- Embeddings are stored **raw (un-normalized)**: they're queried with pgvector cosine distance (`<=>`), which is scale-invariant, so normalizing would be a no-op and would also split the column's scale from the older n8n-written rows.
- Neither column is in `RECIPE_COLUMNS`, so both are **write-only** — not read back onto `RecipeRow`.

## Search — the recipe's name OR its catalog ingredients

**`recipeSearchFilter` (`src/lib/recipes.ts`) is the only place a query becomes a filter**, and
its first arm is the `recipes.name` column — as are both name sorts and the two junk-name guards
beside it. The blob's frozen `name` is read by nothing.


`getRecipes` and `getStatusCounts` both go through it. They are two requests answering one screen —
the grid lists the rows, the status chips count them — so a predicate living in only one of them
would have the chips claiming a total the grid cannot produce. A test pins the two strings equal.

The other two arms are PostgREST **computed fields**, each a `stable security definer` function
over the `recipes` row: **`ingredient_catalog_text`** (0023) returns the newline-joined catalog
`name` + `aliases` of every line that resolves to a catalog ingredient, and
**`ingredient_line_text`** (0027) returns the newline-joined `name_text` of the recipe's own
lines, matched or not. Both are filter-only pseudo-columns, never selected — `RECIPE_COLUMNS`
doesn't name either and `selectColumns<RecipeRowColumns>()` stays exhaustive — so no read path
changes shape.

- **A computed field, not an RPC, because ordering stays with the caller.** The user's sort
  (`newest`/`oldest`/`name-asc`/`name-desc`), `count: exact`, `.range()` and the status/source
  filters all keep working untouched, and search stays one query. An RPC returning the result set
  would have to re-implement every one of those in SQL; an RPC returning ids would put a uuid list
  in the URL, past the ~16 KB cliff `ID_CHUNK` exists for.
- **Two vocabularies, in that order of authority.** The catalog arm speaks the controlled
  vocabulary a person can also browse in the ingredient manager, and aliases are its point: they
  are what lets "cilantro" find a recipe whose line reads "fresh coriander". The line arm speaks
  the recipe's own wording, and exists because the catalog arm skips an unmatched line by
  construction — those are the recipes a reader is least likely to reach any other way. A line
  hit ranks below a catalog hit rather than beside it (see the tiers below).
- **`name_text`, not `raw_text`.** The parsed name is the food the line is about; the raw line
  carries its quantity, unit and preparation, so "cup" or "2" would match most of the corpus.
  Where the parser could not read a line, `name_text` IS the whole lowercased line, so the
  hardest cases lose nothing.
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
- **A tier decides the order first, the score only within it**: 3 a name hit (on the `name` column,
  as are both junk-name guards), 2 a catalog hit, 1 a line-label hit. The tier exists because "a
  catalog hit beats a line hit" has no room left in the score — a catalog hit whose lines carry no
  weight already scores 0, and those stay visible. The
  score is the matched lines' summed `resolved_grams` over a
  denominator — the recipe's stated `total_weight_amount` when it has one, else what its lines add
  up to. That second denominator undercounts wherever a line could not be weighed, which inflates
  the share; accepted, because the alternative is refusing to rank two thirds of the matches, and it
  sharpens as normalization fills `resolved_grams` in. A recipe with neither scores 0 and sorts last
  rather than disappearing.
- **It matches on the same three arms `recipeSearchFilter` builds**, so the ranked page and the
  status chips beside it can never describe different sets. The tier and the score are layered on
  top and never widen or narrow the match.
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

**The read exit — `hydrate` in `src/lib/recipes.ts`** — is the one place a `RecipeRow` is built: times from their columns, groups from the column joined to the rows, and the blob's frozen `recipeIngredient` key **deleted**. That key sits in every pre-0016 row at its 2026-09 backfill value; nothing strips it in the database (same precedent as the times), so the read exit is what keeps it from reaching a consumer — the MCP server JSON-stringifies whole rows. Every write strips it too (`stripIngredientKey`, beside `stripSchemaOrgKeys`), because the zod schema is `.passthrough()` and an agent can still send it.
- `getRecipeById` hydrates rows **and** the catalog (`getCatalogForRows`): each line's `ingredient` is the `IngredientRow` or `null`.
- `getRecipes` hydrates rows in one batched query per page (`getRecipeIngredientsByRecipeIds`, chunked by 100 ids for the PostgREST URL limit — `getIngredientsByIds` chunks on the same `ID_CHUNK`). The rows are not optional — `/api/recipes` feeds MealSearch, whose rows go straight into a `ScalableRecipe` when a recipe joins a meal.
- **The catalog is opt-in on the list query: `getRecipes({ catalog: true })`.** It costs one more round trip for the *page* (every line on it, deduped by ingredient id — never one per recipe), and the home page pays it so the cards can carry nutrition badges. Without it `ingredient` is left **undefined**, and `computeRecipeNutrition` treats undefined and null alike, so an opted-out row reports no nutrition rather than a total undercounted by the lines it couldn't see. `/api/recipes` and MCP `search_recipes` render recipe text only and stay opted out.
- An id no row answers to is **skipped**: the recipe renders one line short, and the next save repairs it. That state is reachable (see the write order), so throwing would take the page down over it.

**Writes go through `reconcileRecipeIngredients`** (`src/lib/recipeIngredientReconcile.ts`, pure, tested without a database). Input is `RecipeIngredientGroupInput[]` — groups of `{ id?, raw_text }`. A line keeps its row by naming its id (only THIS recipe's rows count; each row is claimed once); a line with no usable id claims an unclaimed row with identical text (a re-scrape or an MCP create carries no ids, and recreating every row would drop every curated catalog match); whatever is left is a new row, its id minted **before** any write because the column must name it and PostgREST does not promise bulk-insert order. A kept row with new text is re-parsed (`parseLineDeterministic`), dropping `estimated_grams` only when quantity/unit moved. Two things schedule normalization: `lineSetChanged` (an insert or a delete, so some line has no association at all) and a non-empty `updates` (a reword, whose stored association answers for wording the line has moved away from). The reworded ids travel to the run as `rematchIds` — the only rows it may re-answer — see [nutrition.md](nutrition.md).

**The write order is load-bearing.** PostgREST gives one statement per request and there is no transaction, so `updateRecipeRow` goes: insert new rows → update reworded rows → **write the `recipes` row (the commit point: the column is the index)** → delete dropped rows (best-effort; a prune failure is logged, never fails the save). A crash before the third step leaves unreferenced rows; after it, orphans. Both are invisible to readers and prunable. `createRecipeRow` inserts the recipe row **first** because the ingredient rows reference it (FK), with the column already naming the minted ids; a failure between the two renders the recipe short those lines. A SQL function taking the whole reconcile is the upgrade path if this ever needs to be atomic.

**Normalization only updates rows** (`updateRecipeIngredientRows`, an upsert on the primary key): it never creates or prunes, because the reconcile owns the row set. A row the reconcile dropped mid-run is simply absent from the ids the run carries.

**Nothing reads the blob but the repo layer.** The RPCs that once handed `metadata->'schema'` to n8n are dropped (0018) — agent search goes through the MCP `search_recipes` tool — and `search_recipes_ranked` (0027) reads the `name` column. Anything that queries the blob directly gets a frozen copy, so don't add such a reader.

## Promoted instructions — `recipes.instructions`

**`recipes.instructions` (jsonb, NOT NULL, default `[]`; column 0016, shape 0021) holds `RecipeInstructionGroup[]` — the app's own shape, stored as is:**

```jsonc
[ { "steps": [ { "text": "Boil water." } ] },                                          // nameless run: the `name` key is ABSENT
  { "name": "Sauce", "steps": [ { "text": "Simmer.", "name": "Simmer", "seconds": 330 } ] } ]
```

A step has no identity and nothing joins to it, so unlike ingredients there is no second table, no id array, no reconcile and no hydrate step: `hydrate` passes the column through, and a write replaces the whole list. `RECIPE_COLUMNS` selects it on the list query too — MealSearch hands a secondary recipe straight to cooking mode, which renders its steps and seeds its timers.

- **Every write stores canonical form** (`canonicalizeInstructions`, `src/lib/recipeInstructions.ts`): text and names trimmed, blank steps and empty groups dropped, `seconds` kept only as a positive whole number beside a `name`, adjacent nameless groups merged. `createRecipeRow` and `updateRecipeRow` both apply it, so an agent's payload and the editor's draft land identically; `/update` echoes the stored list because it can differ from what was sent.
- **The blob's `recipeInstructions` is a dead key**, frozen at its pre-0021 value in older rows, exactly like `recipeIngredient`. Every dead key is named in `src/lib/format.ts`, split by *why* it is dead: `PROMOTED_KEYS` are column-backed and rebuilt at the edges from their columns; `DROPPED_KEYS` (`author`, `keywords`, `datePublished`, `nutrition`) are rebuilt nowhere, because nothing wants them. `SCHEMA_ORG_ONLY_KEYS` is the union, and both halves are top level — `deleteDeadKeys` (`src/lib/recipes.ts`) runs in `hydrate` at every read exit, `stripSchemaOrgKeys` on every blob write (the zod schema is `.passthrough()`, so an agent can still send any of them). The stripper lives in `format.ts` so the client-side inbound edge (`draftRecipeDocument`) and the server write path run the same one.
- `recipeToMarkdown(doc)` takes the whole `RecipeDocument` — one argument rather than a growing positional list — and renders the steps from the column into `content` — `## Instructions`, then `## <name>` per named group and `- text` per step — on every create and on any update that touches the schema, the ingredients or the instructions.

## Promoted time columns — no hydrate-back

**`recipes.prep_time` / `cook_time` / `total_time` (integer SECONDS, nullable) are the source of truth for a recipe's times** (0019, re-based to seconds in 0020). The copies in `metadata.schema.{prepTime,cookTime,totalTime}` are **dead keys** — deleted at the read exit, stripped from every write, and read by nothing.

**There is no seam holding the blob keys in step with the columns, and there must not be one.** Every reader — `RecipeCard`, `RecipeDetail`, `CookingMode`, `recipeToMarkdown` — takes `prep_time` / `cook_time` / `total_time` off the document through `formatSeconds`. The three keys are members of `PROMOTED_KEYS`, so the same `deleteDeadKeys` / `stripSchemaOrgKeys` pair that handles every other promotion handles them, and **no migration is needed to scrub what is stored**: reads never show the keys and the next write to a row drops them.

**Seconds are the unit everywhere inward.** `updateRecipeRow` takes `times` as `{ prep?, cook?, total? }` in seconds, each member independently three-way — absent leaves that column alone, `null` clears, a number sets. Unlike `servings`, each member is keyed separately: a serving unit without a count is not a state a recipe can be in, but one time without the other two is. A `times` patch also recomputes `content`, because the markdown prints a Prep/Cook/Total line. ISO 8601 survives at four edges only — the two outbound Schema.org builders, a scrape arriving through `createRecipeRow` / `draftRecipeDocument`, and MCP `update_recipe`'s `times` argument, which parses it once at the tool boundary.

**The corollary is still the thing to protect: a reader that queries `recipes` without coming through the repo layer gets no ingredients and a blob full of dead keys, silently.**

## Promoted scalar columns — `name`, `image`, `description`, `notes`, `cooking_notes`

**`recipes.name` (text, NOT NULL) is the recipe's title and its identity in every listing** (0026,
constrained in 0027), and `image` / `description` / `notes` / `cooking_notes` (text, nullable) are
the rest of what a card, a detail page and cooking mode render. All five ride on `RecipeDocument`,
and `metadata.schema`'s copies are dead artifacts — no hydrate-back, for the reason the servings
have none.

- **`image` is one URL, not Schema.org's `string | string[]`.** The array is a wire shape, reduced
  by `getFirstImage` at the two inbound edges (`createRecipeRow`, `draftRecipeDocument`) exactly
  where `parseYield` reduces the yield — **before** `stripSchemaOrgKeys` takes the key off, or the
  column lands NULL with nothing to report it.
- **Blank collapses to NULL on every write** (`textOrNull`, `src/lib/recipes.ts`). Readers branch on
  presence, so `""`, `"   "` and absent have to arrive as one value. `name` is the exception: a
  blank name is dropped from the patch rather than written, because the column is NOT NULL and an
  empty title box is a mistake, not an instruction.
- **`notes` is the author's, `cooking_notes` is the cook's.** Both are app-internal: `notes` reaches
  the image webhook via `toSchemaOrgRecipe`, neither reaches JSON-LD. `cooking_notes` is read-only
  to agents — MCP create/update ignore it with a warning and `clear_cooking_notes` is the only
  agent-writable path.
- **`updated_at` is maintained by the repo layer, not a trigger.** The column has a `now()` default
  and nothing else, so `updateRecipeRow` and `archiveRecipe` stamp it; the detail and cooking
  headers render it. Any new writer that bypasses those has to stamp it too.

## Promoted servings columns — no hydrate-back

**`recipes.servings_amount` / `servings_unit` / `total_weight_amount` / `total_weight_unit` (0022) are the source of truth for a recipe's serving count, what it counts, and the whole recipe's raw weight.** The copies in `metadata.schema.recipeYield` and `metadata.schema.nutrition` are **dead artifacts** — no migration strips them, and nothing may read or write them again.

**There is NO hydrate-back here either.** Writing `recipeYield` back at the read exit would recreate exactly the free-text round trip the columns replaced, so it joins the dead keys — deleted on read, stripped on write — and the outbound Schema.org edges rebuild it from the columns via `schemaOrgYield`. Every promoted field follows this rule.

Conversions live in `src/lib/units.ts` and `src/lib/format.ts` — never re-derive them. Inbound is `parseYield`, which runs at exactly two edges (`draftRecipeDocument`, `createRecipeRow`) and returns null for anything it cannot read, so the columns stay NULL rather than holding a guess. Outbound are `formatServings` (display) and `schemaOrgYield` (the wire). Full rules → [recipe-schema.md](recipe-schema.md).

`updateRecipeRow` takes `servings` / `totalWeight` as `{ amount, unit? }` objects rather than four loose scalars, which gives the same three-way semantics the times have without a pair a caller can swap: the key absent leaves the columns alone, `amount: null` clears, a number sets. The write keys its "what will this row hold" reads on **presence in the write patch**, not `??` — clearing a count writes null, and `null ?? current` would silently restore the value the write is removing. A servings change also recomputes `content`, because the markdown's Yield line reads the columns.

Conversions live in `src/lib/format.ts` — never re-derive them. The ISO → column direction is just `parseDurationToSeconds`, which already existed; the return trip is `secondsToIso` / `formatSeconds`. `isIsoDuration` answers the *syntax* question separately, because `"PT0M"` (a no-cook recipe saying so) and `"P4D"` (a duration we can't read) both parse to `null` and only the second is a value being dropped.

**The editor is HH:MM, which is coarser than the column** — `formatTimeInput` / `parseTimeInput` / `canonicalizeTimeInput`. `formatTimeInput` rounds to the nearest minute, so a stored value carrying seconds is rewritten if that recipe is ever edited. Two values in the whole recipe set are affected; the asymmetry is deliberate (a recipe time is written in hours and minutes) and recorded on the function.

## Migrations

**Migration records in `db/migrations/` are applied out-of-band** via Supabase MCP `apply_migration` (project `xonkmdhnjpjkapnsmltu`); 0006+ show up in the project's migrations table, 0002–0005 predate that and don't — check `information_schema` for actual state, not the migrations list. 0016/0017 are applied (as `recipes_ingredients_instructions` / `recipe_ingredients_position_optional`); 0018 drops the dead `match_recipes` / `find_dinner` RPCs; 0021 is a column comment recording `recipes.instructions`' group shape — DDL only; 0023 adds the `ingredient_catalog_text` computed field that recipe search's ingredient arm filters on, 0024 the derived `recipe_ingredients.resolved_grams` it ranks by, and 0025 the `search_recipes_ranked` RPC that does the ranking (see Search above). 0026 adds `ingredients.last_checked` — nullable, no default and **no backfill**, because NULL there means "never verified against a source" and deriving one from `updated_at` would assert a check that never happened (see [nutrition.md](nutrition.md)). 0027 adds the `ingredient_line_text` computed field and redefines `search_recipes_ranked` to tier a catalog hit above a line-label hit — **one migration because the two are meaningless apart**: applied separately, the plain and ranked search paths would disagree about which recipes match. **It must be applied before the code that references it ships**, or every search is a 400 against a function that does not exist. 0028 adds the promoted scalar columns (name was already there and already written; 0028 is what made it the thing that gets read), and 0029 re-points that RPC at `recipes.name` and makes the column NOT NULL. **0029 supersedes 0027's definition of `search_recipes_ranked`** — the two were written in parallel and met in a merge, so 0029 is the one to edit and 0027 is kept only so a replay reaches the same place.

**There is no times backfill any more.** `yarn backfill:recipe-times` is deleted: 0019/0020's
columns have been the truth for months, the read exit deletes the blob keys it read from and every
write strips them, so a re-run could only ever report that there is nothing to do. **Three recipes
carry time text the app cannot read, and it survives only in the blob** — the ISO regex is
`PT`-only, with no day field. Type these into the columns before the tagging branch archives and
drops `metadata`, or they are lost:

| Recipe | Key | Stored text |
|---|---|---|
| Italian-Inspired Zucchini Garlic Bites (`5a4cdedd`) | `prepTime` / `cookTime` | `15 min` / `20–22 min` |
| Sourdough Croissant Bread (`75438ce2`) | `totalTime` | `P1DT13H20M` (37 h 20 m) |
| Spiced Labneh Balls (`45afe002`) | `totalTime` | `P4D` |

**`yarn backfill:recipe-servings [--dry-run] [--limit=N]`** populates 0022's four columns from each row's `recipeYield`. It reports three buckets and guesses at none: yields it refused (columns left NULL), yields whose rendered label now differs (a collapsed range, a dropped parenthetical), and a `nutrition.servingSize` the columns cannot reconstruct. It does not refresh `content`.

**`yarn backfill:resolved-grams [--dry-run] [--limit=N]`** stamps 0024's column on the rows that
predate it, using `resolveLineGrams` — the same resolver the write path and the nutrition math use,
so the backfill cannot disagree with the runtime about what a line weighs. It guesses at nothing: a
line it cannot weigh is written NULL, and a deliberate 0 round-trips unchanged. Idempotent, so a
second pass writes nothing.

**`yarn backfill:recipe-blob-fields [--dry-run] [--limit=N]`** fills 0026's four columns from the
blob. Fill-only: a column that already holds something is never overwritten, which is what makes it
safe to run at any point rather than only in one window. It writes no name — every row has one —
and instead reports any row whose column and blob disagree, and any with a name in neither (which
0027's NOT NULL would reject).

**It has to be re-run at deploy time, and this is why:** production is still running pre-promotion
code, which writes these fields into the blob ONLY. Every recipe created since the 2026-09-22 pass
therefore has a gap — 36 descriptions, 12 notes, 7 images and 2 cooking notes as of 2026-11-10,
every one of them a row whose `created_at` equals its `updated_at`. The gap keeps growing until the
promotion ships, so the last pass belongs after the deploy, not before it.

**`yarn sync:ingredient-columns [--dry-run] [--limit=N] [--id=<uuid>]`** brings a recipe's column and rows up to its blob's `recipeIngredient` — the one-shot for recipes edited through a blob-writing build after the 0016 backfill, and the last reader of the dead key. Deterministic only: new rows land unmatched; the matcher is never invoked.

**There is no instructions sync, and no code reads the blob's `recipeInstructions`.** `recipes.instructions` is the only source of a recipe's steps. A column-aware write strips the blob key, so translating blobs into the column would wipe those recipes' steps.
