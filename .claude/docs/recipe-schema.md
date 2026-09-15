# Recipe Schema — Custom Fields and Serialization

## Ingredients and instructions are not on `SchemaRecipe`

Internally a recipe is `SchemaRecipe` (`metadata.schema` — name, nutrition, notes) plus the column-backed fields: its ingredients, `RecipeRow.ingredients: RecipeIngredientGroup[]`, its instructions, `RecipeRow.instructions: RecipeInstructionGroup[]`, its times, `prep_time`/`cook_time`/`total_time` in seconds, and its servings, `servings_amount`/`servings_unit` plus `total_weight_amount`/`total_weight_unit`. They travel together as a `RecipeDocument` (`{ schema, ingredients, instructions, prep_time, cook_time, total_time, servings_amount, servings_unit, total_weight_amount, total_weight_unit }`), built by `recipeDocument(row)` for a stored recipe, `draftRecipeDocument(schema, lines, steps)` for content not saved yet (a re-scrape under review), or `documentFromSchemaOrg(recipe)` at the inbound window-API edge (`src/lib/recipeDocument.ts`, client-safe). `applyRecipeDocument(row, doc)` is the way back: the row with **every** column-backed field — schema, ingredients, instructions, times, servings — laid over it, which is what RecipeDetail hands cook mode so a saved edit is what opens there. A field promoted to a column has to be added there too, and nothing in the type system says so: `...row` already supplies one of the right type, just the stale one. There is no `recipeIngredient`, `recipeInstructions`, `recipeYield` or `nutrition.servingSize` field anywhere inside the app; the type has none of them, and the repo layer deletes all four keys from the stored blob at every read exit (full rules → [supabase-data-layer.md](supabase-data-layer.md)).

`metadata.schema` is scheduled for eventual deprecation, field by field: each field that gains a column is read from the column, and the outbound Schema.org edges below translate the document into a Schema.org superset. Ingredients, instructions, times and servings are the fields promoted so far.

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

Schema.org is a wire format for the outside world, produced and consumed in exactly four places. Nothing else may build a `recipeIngredient` or `recipeInstructions` array, or a `recipeYield`, or read one. Both outbound functions take a `RecipeDocument` and read every column-backed field from its column: `recipeIngredient` is the groups flattened to `raw_text`; `recipeInstructions` is `toSchemaOrgInstructions(doc.instructions)` — a nameless group emits top-level `HowToStep`s, a named group a `HowToSection`, and `timeRequired` (ISO 8601 via `secondsToIso`) appears only on a step with both a label and a duration; `prepTime`/`cookTime`/`totalTime` are the three seconds columns as ISO 8601 (a null column drops the key); `recipeYield` is `schemaOrgYield(doc)` — always a QuantitativeValue built from the servings and weight columns, absent when there is no count. The copies the blob may still carry are never read — `format.test.ts` pins that a stale `schema.cookTime` loses to `cook_time` and a stale `schema.recipeInstructions` loses to `doc.instructions`.

| Edge | Direction | Function |
| --- | --- | --- |
| JSON-LD `<script>` in `RecipeDetail` | out | `toSchemaOrgJsonLd(doc, options?)` — explicit allowlist of standard fields; lines flattened to strings; steps as HowTo objects |
| Image-generation webhook (`/regenerate-image`) | out | `toSchemaOrgRecipe(doc)` — the whole document, custom fields included, lines flattened, steps as HowTo objects |
| `window.recipeTools` (`src/lib/windowApi.ts`) | both | `toSchemaOrgRecipe` out; `documentFromSchemaOrg` in (lines drafted, steps grouped, ISO times parsed to seconds, the yield parsed to columns) |
| Scraped input — MCP `create_recipe`, the `/rescrape` webhook response | in | `fromSchemaOrgIngredients(lines)` → `RecipeIngredientGroupInput[]`; groups by first appearance, ungrouped lines join the one nameless group. `fromSchemaOrgInstructions(raw)` → `RecipeInstructionGroup[]`; takes the array `schemaOrgRecipeInputSchema` validates — `HowToStep` objects (`@type` optional) and `HowToSection`s whose `itemListElement` is an array of them — and reads anything but an array as no steps; top-level steps group **by run** around sections; a duration survives only beside a name |

The types: `SchemaOrgRecipe = SchemaRecipe & { recipeIngredient?: string[]; recipeInstructions?: Array<HowToStep | HowToSection>; recipeYield?: string | string[] | QuantitativeValue; nutrition?: SchemaOrgNutrition }` (outbound; `recipeInstructions` and `recipeYield` are the same inbound, and `SchemaOrgNutrition` is `SchemaNutrition` plus the derived `servingSize`) and `SchemaOrgIngredientLine` (`{ name, group? }`, accepted alongside bare strings inbound). MCP `update_recipe` speaks the internal shape — `ingredients` and `instructions` groups, `servings` and `total_weight` — and rejects `schema.recipeIngredient` / `schema.recipeInstructions` / `schema.recipeYield` outright rather than silently stripping them.

## Recipe Servings

`recipeYield` and `nutrition.servingSize` are **column-backed** as of 0022 —
`recipes.servings_amount` (numeric, nullable) + `servings_unit` (text, nullable, stored PLURAL as the
source wrote it) are the serving count and what it counts, and `total_weight_amount` /
`total_weight_unit` (metric: `g|kg|ml|l`) are the whole recipe's raw weight, the ex-`valueReference`.
All four ride on `RecipeDocument`. **There is no hydrate-back**: unlike the times, nothing above
`src/lib/recipes.ts` reads either key off the blob, so writing them back at the read exit would
recreate the string round trip this replaced. Both join `SCHEMA_ORG_ONLY_KEYS` instead — deleted at
the read exit, stripped from every write.

- **`parseYield` (`src/lib/units.ts`) is the app's only yield parse**, and it runs at exactly two
  inbound edges: `draftRecipeDocument` (which covers the window API and a re-scrape) and
  `createRecipeRow`. It returns `{ amount, unit, weight } | null`, and **null means unparseable —
  callers leave the columns alone and report it, never substitute a default.** The amount must be
  anchored at the FRONT of the string (after `makes|serves|yields|about|~`); ranges collapse to their
  rounded midpoint. A yield whose unit is a *measurement* (`300ml`, `1 lb`, `~1.5 cups`, `9 tbsp`)
  is rejected outright: it states how much the recipe makes, not how many portions it divides into.
- **`applyServings` does not exist.** A write sets the columns: `UpdateRecipePatch.servings`
  (`{ amount, unit? }`) and `.totalWeight`, three-way like the times — key absent leaves them alone,
  `amount: null` clears, a number sets. `SchemaRecipe` has no `recipeYield` to splice.
- **Outbound, `schemaOrgYield(doc)` (`src/lib/format.ts`) builds a QuantitativeValue from the
  columns** — never free text — and `recipeYield` is deliberately NOT on `toSchemaOrgJsonLd`'s
  `optionalFields` allowlist: a key on that list is read straight off the blob, where a stale string
  still sits on older rows.
- **`nutrition.servingSize` is derived, not stored**: `ScalableRecipe.servingSizeLabel` is
  `1 <singular servings_unit>` ("1 serving", "1 kebab"), switching to "portion" when split exactly as
  `nutritionUnitLabel` does, so the panel's phrase and the published value cannot drift. Its only two
  consumers are RecipeDetail's JSON-LD and MCP `get_recipe`; nothing in the UI renders it.
- **`formatServings(amount, unit)` is the one display formatter** and singularizes at a count of 1.
- **UI:** editing mirrors the times — `TimeYieldStats` takes `servingsAmount` / `servingsUnit`, and
  its `servingsEdit` prop takes precedence over the stepper and forces the band to render even with
  zero stats, so a recipe with no count can gain one. The cell components `Stat` and
  `ServingsInputCell` live in their own modules with their own stories (PR #60 review) — don't fold
  them back in. **The editor edits both columns**: `ServingsInputCell` is two inputs, the count and
  the unit, which is why its heading is the static word "Servings" rather than the unit — an
  editable unit beside a unit heading renders the same word twice. A blank unit input is a CLEAR
  (`unit: null`), not "leave it alone", and the field carries `SERVINGS_UNIT_FALLBACK` as its
  placeholder so the user can see what blank means. The count gates the whole patch: an unusable
  count drops the unit edit with it, because a unit with no count is not a state a recipe can be in.
  **The recipe's raw weight (`total_weight_*`) stays MCP-only** — a heavyweight multi-field
  `YieldEditor` was removed in 7e81735, and this is deliberately not that: two columns, two text
  inputs, no editor-only type and no converters.
- **MCP:** `create_recipe` accepts `schema.recipeYield` (a scrape speaks Schema.org) and parses it
  once; `update_recipe` **rejects** it with `RECIPE_YIELD_ON_UPDATE_ERROR` and takes `servings` /
  `total_weight` instead — the same call the ingredient and instruction rules make.

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
- Any new standard Schema.org/Recipe property added to `SchemaRecipe` must also be added to the `optionalFields` array in `toSchemaOrgJsonLd`, or it won't appear in JSON-LD output. A property promoted to a column instead joins `schemaOrgTimes` / `schemaOrgYield`'s pattern: built from the document and kept OFF the allowlist, so the blob's copy can never win
- Any new custom/app-level field on `SchemaRecipe` must be intentionally left out of `toSchemaOrgJsonLd`
- Ingredient groups and entities are internal-only — only their text crosses this boundary. Instruction groups cross as `HowToSection`s (a nameless run as top-level steps) and a step's timer as `name` + `timeRequired`
