# Recipe Schema — Custom Fields and Serialization

## Ingredients and instructions are not on `SchemaRecipe`

Internally a recipe is `SchemaRecipe` (`metadata.schema` — name, yield, nutrition, notes) plus the column-backed fields: its ingredients, `RecipeRow.ingredients: RecipeIngredientGroup[]`, its instructions, `RecipeRow.instructions: RecipeInstructionGroup[]`, and its times, `prep_time`/`cook_time`/`total_time` in seconds. They travel together as a `RecipeDocument` (`{ schema, ingredients, instructions, prep_time, cook_time, total_time }`), built by `recipeDocument(row)` for a stored recipe, `draftRecipeDocument(schema, lines, steps)` for content not saved yet (a re-scrape under review), or `documentFromSchemaOrg(recipe)` at the inbound window-API edge (`src/lib/recipeDocument.ts`, client-safe). `applyRecipeDocument(row, doc)` is the way back: the row with **every** column-backed field — schema, ingredients, instructions, times — laid over it, which is what RecipeDetail hands cook mode so a saved edit is what opens there. A field promoted to a column has to be added there too, and nothing in the type system says so: `...row` already supplies one of the right type, just the stale one. There is no `recipeIngredient` or `recipeInstructions` field anywhere inside the app; the type has neither, and the repo layer deletes both keys from the stored blob at every read exit (full rules → [supabase-data-layer.md](supabase-data-layer.md)).

`metadata.schema` is scheduled for eventual deprecation, field by field: each field that gains a column is read from the column, and the outbound Schema.org edges below translate the document into a Schema.org superset. Ingredients, instructions and times are the fields promoted so far.

```ts
interface RecipeIngredientGroup { name?: string; ingredients: RecipeIngredient[] }
interface RecipeIngredient extends Omit<RecipeIngredientRow, "recipe_id"> {
  ingredient?: IngredientRow | null;   // catalog row; undefined = not loaded, null = unmatched
}
interface RecipeInstructionGroup { name?: string; steps: RecipeStep[] }
interface RecipeStep { text: string; name?: string; seconds?: number }   // name = cook-mode timer label; seconds only ever beside a name
```

- A group's `name` is absent for the nameless group. An ungrouped recipe is exactly one nameless ingredient group; a grouped one is several, each named. Position is the array index at both levels.
- A `RecipeIngredient` IS its `recipe_ingredients` row: `id` is its identity, `raw_text` is what the recipe says, the parse fields and the catalog association ride along. `newRecipeIngredient` (`src/lib/recipeIngredients.ts`) builds one from text alone — parsed deterministically, unmatched, freshly identified — for previews that exist before any row does (a re-scrape under review, a recipe pushed in through the window API).
- Renderers read the groups directly (`ScalableRecipe.groupedIngredients` is the groups, scaled). There is no partition rule to apply.
- An instruction group is a run of steps under an optional heading. Unlike ingredients, order between groups is semantic, so nameless runs may sit on either side of a named group — never beside each other. A step has no identity and nothing joins to it: the stored column IS this shape, and a write replaces the whole list.
- **Every instruction write stores canonical form** — `canonicalizeInstructions` (`src/lib/recipeInstructions.ts`): text and names trimmed, blank steps and empty groups dropped, `seconds` kept only as a positive whole number beside a `name`, adjacent nameless groups merged. The repo layer, `editableToInstructions` and `fromSchemaOrgInstructions` all run it, which is what makes the Schema.org round trip lossless (two nameless runs in a row have no HowTo spelling that keeps them apart). `stepTimers(groups)` — a step with both a label and a duration — is the one timer-seeding rule, and cooking mode reads it.

**The ingredient write input is `RecipeIngredientGroupInput`** — the same groups with each line reduced to `{ id?, raw_text }`. `id` names the row the line already is; leave it off only for a new line. The editor draft carries it as `EditableIngredient.recipeIngredientId`, and `editableToIngredientInput` hands it back on save — that is what keeps a line's catalog match across an edit. Instructions have no separate write input: `RecipeInstructionGroup[]` is what a writer sends, and `editableToInstructions` produces it from the editor's minutes:seconds draft.

## The four Schema.org edges

Schema.org is a wire format for the outside world, produced and consumed in exactly four places. Nothing else may build a `recipeIngredient` or `recipeInstructions` array or read one. Both outbound functions take a `RecipeDocument` and read every column-backed field from its column: `recipeIngredient` is the groups flattened to `raw_text`; `recipeInstructions` is `toSchemaOrgInstructions(doc.instructions)` — a nameless group emits top-level `HowToStep`s, a named group a `HowToSection`, and `timeRequired` (ISO 8601 via `secondsToIso`) appears only on a step with both a label and a duration; `prepTime`/`cookTime`/`totalTime` are the three seconds columns as ISO 8601 (a null column drops the key). The copies the blob may still carry are never read — `format.test.ts` pins that a stale `schema.cookTime` loses to `cook_time` and a stale `schema.recipeInstructions` loses to `doc.instructions`.

| Edge | Direction | Function |
| --- | --- | --- |
| JSON-LD `<script>` in `RecipeDetail` | out | `toSchemaOrgJsonLd(doc, options?)` — explicit allowlist of standard fields; lines flattened to strings; steps as HowTo objects |
| Image-generation webhook (`/regenerate-image`) | out | `toSchemaOrgRecipe(doc)` — the whole document, custom fields included, lines flattened, steps as HowTo objects |
| `window.recipeTools` (`src/lib/windowApi.ts`) | both | `toSchemaOrgRecipe` out; `documentFromSchemaOrg` in (lines drafted, steps grouped, ISO times parsed to seconds) |
| Scraped input — MCP `create_recipe`, the `/rescrape` webhook response | in | `fromSchemaOrgIngredients(lines)` → `RecipeIngredientGroupInput[]`; groups by first appearance, ungrouped lines join the one nameless group. `fromSchemaOrgInstructions(raw)` → `RecipeInstructionGroup[]`; accepts a markdown string, one item, or an array mixing bare strings, `{ text }` objects with or without `@type`, and sections whose `itemListElement` is an array, one step or missing; top-level steps group **by run** around sections; a duration survives only beside a name |

The types: `SchemaOrgRecipe = SchemaRecipe & { recipeIngredient?: string[]; recipeInstructions?: Array<HowToStep | HowToSection> }` (outbound), `SchemaOrgIngredientLine` (`{ name, group? }`, accepted alongside bare strings inbound) and `SchemaOrgInstructions` (every inbound instruction shape). MCP `update_recipe` speaks the internal shape — `ingredients` and `instructions` groups — and rejects `schema.recipeIngredient` / `schema.recipeInstructions` outright rather than silently stripping them.

## Base Servings Editing

Edit mode edits the recipe's **base servings** (persisted `recipeYield`), distinct from the `ServingsControl` stepper which only scales the display. `recipeYield` is `string | string[] | QuantitativeValue`; `parseServings` (read) and `applyServings` (write-back) in `src/lib/units.ts` are inverses: `parseServings(applyServings(yld, n)) === n`.

- **`applyServings` preserves shape:** QV keeps `unitText`/`valueReference` (whole-recipe weight — per-serving weight recomputes); strings get their first amount token replaced ("Makes 6" → "Makes 8"); ranges and arrays deliberately collapse to a single string; no/unparseable yield becomes `{ "@type": "QuantitativeValue", value: n }`.
- **`useRecipeEditor.buildPatch` only applies servings when the parsed input differs from `parseServings(base.recipeYield)`.** Load-bearing: `"6-8 servings"` seeds the input with midpoint "7", so an untouched save must not collapse the range (pinned by a test in `useRecipeEditor.test.ts`). Invalid input (blank/non-integer/<1) degrades to "no change" — it never blocks Save.
- **UI:** `TimeYieldStats`'s `servingsEdit` prop takes precedence over the stepper and forces the band to render even with zero stats (so a yield-less recipe can gain one). The band's cell components `Stat` and `ServingsInputCell` live in their own modules in `src/components/` with their own stories (PR #60 review) — don't fold them back in.
- A heavyweight multi-field `YieldEditor` was removed in 7e81735; don't re-add whole-yield editing, servings-only is intentional.

## Recipe Times

`prepTime` / `cookTime` / `totalTime` are **column-backed** as of 0019 — `recipes.{prep,cook,total}_time` (integer seconds, 0020) is the truth, carried on `RecipeDocument` as `prep_time`/`cook_time`/`total_time`. The repo layer hydrates the ISO keys onto `SchemaRecipe` at every read exit, but the document's columns are what the editor seeds from (`useRecipeEditor.begin`), what an unparseable edit falls back to, and what the Schema.org edges emit; the copies in the stored blob are dead. Full rules → [supabase-data-layer.md](supabase-data-layer.md).

Two consequences for anything touching `SchemaRecipe`:
- On the write side the three fields are `string | null`, not `string | undefined`. `null` is a **clear**; omitting the key means "leave it alone". A cleared time is a null column, which the edges drop from the output.
- `totalTime` is **not** derived from prep + cook and must not be — a recipe can have resting or marinating time that belongs to neither.

**UI:** editing mirrors servings exactly — `TimeYieldStats`'s `timesEdit` prop takes precedence over the static `Stat` cells and forces the band to render, so a recipe with no times can gain them. The cell component `TimeInputCell` lives in its own module in `src/components/` with its own stories (same rule as `Stat` / `ServingsInputCell`). It is **not** `editor/DurationInput` — that is the `m:ss` step timer, where "1:30" is ninety seconds; on a recipe it is an hour and a half. The field is **HH:MM** and re-spells itself on blur, which is what lets it also accept a bare minute count and unit-tagged forms without ambiguity.

## Schema.org JSON-LD Sanitization

Custom fields (`notes`, `cookingNotes`, ingredient group names, row ids) must never appear in the JSON-LD `<script>` output — external tools only understand the standard Schema.org/Recipe spec.

`toSchemaOrgJsonLd(doc, options?)` in `src/lib/format.ts` is the single gatekeeper: it uses an **explicit allowlist** of standard fields, emits `recipeIngredient` as the lines' `raw_text` in group order, `recipeInstructions` from the document's groups, and the times from the document's columns.

**Rules:**
- Any new standard Schema.org/Recipe property added to `SchemaRecipe` must also be added to the `optionalFields` array in `toSchemaOrgJsonLd`, or it won't appear in JSON-LD output. A property promoted to a column instead joins `DOCUMENT_TIME_FIELDS`'s pattern: read from the document, never from the blob
- Any new custom/app-level field on `SchemaRecipe` must be intentionally left out of `toSchemaOrgJsonLd`
- Ingredient groups and entities are internal-only — only their text crosses this boundary. Instruction groups cross as `HowToSection`s (a nameless run as top-level steps) and a step's timer as `name` + `timeRequired`
