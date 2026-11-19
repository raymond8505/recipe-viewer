# Recipe Schema — Custom Fields and Serialization

## A recipe is its columns; `SchemaRecipe` is what is left

Internally a recipe is its column-backed fields plus `SchemaRecipe` (`metadata.schema`), which is down to `recipeCuisine` and `recipeCategory` — and nothing else, ever again: the two fields awaiting the tagging system that replaces them, at which point the column itself is archived and dropped. The wire form's two `@` constants left with the times; `toSchemaOrgJsonLd` emits them as literals, because they name the format rather than saying anything about the recipe. Everything a reader wants is a column: its name, image, description, notes and cooking notes (text columns of those names), its ingredients, `RecipeRow.ingredients: RecipeIngredientGroup[]`, its instructions, `RecipeRow.instructions: RecipeInstructionGroup[]`, its times, `prep_time`/`cook_time`/`total_time` in seconds, and its servings, `servings_amount`/`servings_unit` plus `total_weight_amount`/`total_weight_unit`. They travel together as a `RecipeDocument` (`{ schema, name, image, description, notes, cooking_notes, ingredients, instructions, prep_time, cook_time, total_time, servings_amount, servings_unit, total_weight_amount, total_weight_unit }`), built by `recipeDocument(row)` for a stored recipe or `draftRecipeDocument(schema, lines, steps)` for content not saved yet, a re-scrape under review (`src/lib/recipeDocument.ts`, client-safe). **`recipeDocument`'s input is `RecipeDocumentSource`** (`src/types/recipe.ts`) — the row fields a document is built from, derived from `RecipeDocument` itself rather than listed, so a promoted field widens the input and the build fails to compile until it is carried over. Anything that takes a row only to build a document from it names that type rather than re-listing the keys (`recipeNutritionBadges`, PR #86 review). `applyRecipeDocument(row, doc)` is the way back: the row with **every** column-backed field — schema, ingredients, instructions, times, servings — laid over it, which is what RecipeDetail hands cook mode so a saved edit is what opens there. There the compiler is no help — a field promoted to a column has to be added to `applyRecipeDocument` by hand, because `...row` already supplies one of the right type, just the stale one. There is no `recipeIngredient`, `recipeInstructions`, `recipeYield` or `nutrition` field anywhere inside the app; the type has none of them, and the repo layer deletes every dead key from the stored blob at every read exit (full rules → [supabase-data-layer.md](supabase-data-layer.md)).

**Nothing new goes into `metadata.schema`.** A field that a recipe has is a column; the outbound Schema.org edges below translate the document into a Schema.org superset at the boundary. `author`, `keywords`, `datePublished` and `nutrition` are not stored at all — every recipe here is the user's own, `created_at`/`updated_at` are its dates, and nutrition is derived from the ingredient catalog on every read.

```ts
interface RecipeIngredientGroup { name?: string; ingredients: RecipeIngredient[] }
interface RecipeIngredient extends Omit<RecipeIngredientRow, "recipe_id"> {
  ingredient?: IngredientRow | null;   // catalog row; undefined = not loaded, null = unmatched
}
interface RecipeInstructionGroup { name?: string; steps: RecipeStep[] }
interface RecipeStep { text: string; name?: string; seconds?: number }   // name = cook-mode timer label; seconds only ever beside a name
```

- A group's `name` is absent for the nameless group. An ungrouped recipe is exactly one nameless ingredient group; a grouped one is several, each named. Position is the array index at both levels.
- A `RecipeIngredient` IS its `recipe_ingredients` row: `id` is its identity, `raw_text` is what the recipe says, the parse fields and the catalog association ride along. `newRecipeIngredient` (`src/lib/recipeIngredients.ts`) builds one from text alone — parsed deterministically, unmatched, freshly identified — for previews that exist before any row does (a re-scrape under review).
- Renderers read the groups directly (`ScalableRecipe.groupedIngredients` is the groups, scaled). There is no partition rule to apply.
- An instruction group is a run of steps under an optional heading. Unlike ingredients, order between groups is semantic, so nameless runs may sit on either side of a named group — never beside each other. A step has no identity and nothing joins to it: the stored column IS this shape, and a write replaces the whole list.
- **Every instruction write stores canonical form** — `canonicalizeInstructions` (`src/lib/recipeInstructions.ts`): text and names trimmed, blank steps and empty groups dropped, `seconds` kept only as a positive whole number beside a `name`, adjacent nameless groups merged. The repo layer, `editableToInstructions` and `fromSchemaOrgInstructions` all run it, which is what makes the Schema.org round trip lossless (two nameless runs in a row have no HowTo spelling that keeps them apart). `stepTimers(groups)` — a step with both a label and a duration — is the one timer-seeding rule, and cooking mode reads it.

**The ingredient write input is `RecipeIngredientGroupInput`** — the same groups with each line reduced to `{ id?, raw_text }`. `id` names the row the line already is; leave it off only for a new line. The editor draft carries it as `EditableIngredient.recipeIngredientId`, and `editableToIngredientInput` hands it back on save — that is what keeps a line's catalog match across an edit. Instructions have no separate write input: `RecipeInstructionGroup[]` is what a writer sends, and `editableToInstructions` produces it from the editor's minutes:seconds draft.

## The three Schema.org edges

Schema.org is a wire format for the outside world, produced and consumed in exactly three places. Nothing else may build a `recipeIngredient` or `recipeInstructions` array, or a `recipeYield`, or read one. Both outbound functions take a `RecipeDocument` and read every column-backed field from its column: `recipeIngredient` is the groups flattened to `raw_text`; `recipeInstructions` is `toSchemaOrgInstructions(doc.instructions)` — a nameless group emits top-level `HowToStep`s, a named group a `HowToSection`, and `timeRequired` (ISO 8601 via `secondsToIso`) appears only on a step with both a label and a duration; `prepTime`/`cookTime`/`totalTime` are the three seconds columns as ISO 8601 (a null column drops the key); `recipeYield` is `schemaOrgYield(doc)` — always a QuantitativeValue built from the servings and weight columns, absent when there is no count. The copies the blob may still carry are never read — `format.test.ts` pins that a stale `schema.cookTime` loses to `cook_time` and a stale `schema.recipeInstructions` loses to `doc.instructions`.

Both outbound functions build `name`, `image`, `description` and (for the webhook) `notes` from the document's columns, never from the blob — the same rule the times and the yield follow.

| Edge | Direction | Function |
| --- | --- | --- |
| JSON-LD `<script>` in `RecipeDetail` | out | `toSchemaOrgJsonLd(doc, options?)` — explicit allowlist of standard fields; lines flattened to strings; steps as HowTo objects |
| Image-generation webhook (`/regenerate-image`) | out | `toSchemaOrgRecipe(doc)` — the whole document, custom fields included, lines flattened, steps as HowTo objects |
| Scraped input — MCP `create_recipe_detailed` and `create_recipe_simple`, the `/rescrape` webhook response | in | `fromSchemaOrgIngredients(lines)` → `RecipeIngredientGroupInput[]`; groups by first appearance, ungrouped lines join the one nameless group. `fromSchemaOrgInstructions(raw)` → `RecipeInstructionGroup[]`; takes the array `schemaOrgRecipeInputSchema` validates — `HowToStep` objects (`@type` optional) and `HowToSection`s whose `itemListElement` is an array of them — and reads anything but an array as no steps; top-level steps group **by run** around sections; a duration survives only beside a name. `create_recipe_simple` takes those same two wire forms, plus a bare string per step, which `recipeCreateSimpleInputSchema` wraps as a `{ text }` HowToStep — that wrap is what makes a flat list of steps exactly one nameless group. It is the stricter of the two edges: a blank line or step fails the call rather than being dropped (dropping one would leave a short list reading as the recipe's own), and a line is capped at `INGREDIENT_LINE_MAX_LENGTH` |

The types: `SchemaOrgRecipe = SchemaRecipe & { name: string; description?: string; image?: string | string[]; notes?: string; recipeIngredient?: string[]; recipeInstructions?: Array<HowToStep | HowToSection>; recipeYield?: string | string[] | QuantitativeValue; nutrition?: SchemaOrgNutrition }` (outbound; `recipeInstructions` and `recipeYield` are the same inbound, and `SchemaOrgNutrition` is `SchemaNutrition` plus the derived `servingSize`) and `SchemaOrgIngredientLine` (`{ name, group? }`, accepted alongside bare strings inbound). MCP `update_recipe` speaks the internal shape — `name`, `description`, `notes` and `image` as top-level arguments beside `ingredients` / `instructions` groups, `servings`, `total_weight` and `times` — and rejects any of them sent inside `schema`, along with `schema.recipeIngredient` / `schema.recipeInstructions` / `schema.recipeYield` / `schema.prepTime` / `schema.cookTime` / `schema.totalTime`, rather than silently stripping them. `create_recipe` still takes the whole Schema.org object, because a scrape produces one.

## Recipe Servings

`recipeYield` is **column-backed** as of 0022, and `nutrition.servingSize` derived from the same columns —
`recipes.servings_amount` (numeric, nullable) + `servings_unit` (text, nullable, stored PLURAL as the
source wrote it) are the serving count and what it counts, and `total_weight_amount` /
`total_weight_unit` (metric: `g|kg|ml|l`) are the whole recipe's raw weight, the ex-`valueReference`.
All four ride on `RecipeDocument`. **There is no hydrate-back**: nothing above
`src/lib/recipes.ts` reads either key off the blob, so writing them back at the read exit would
recreate the string round trip this replaced. Both join `SCHEMA_ORG_ONLY_KEYS` instead — deleted at
the read exit, stripped from every write. Every promoted field follows this rule; none hydrates
back.

- **`parseYield` (`src/lib/units.ts`) is the app's only yield parse**, and it runs at exactly two
  inbound edges: `draftRecipeDocument` (a re-scrape under review) and
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
- **MCP:** `create_recipe_detailed` accepts `schema.recipeYield` (a scrape speaks Schema.org) and parses it
  once, as does `create_recipe_simple` — which takes the yield flat, as a string or the bare
  number JSON-LD often spells it; `update_recipe` **rejects** it with
  `RECIPE_YIELD_ON_UPDATE_ERROR` and takes `servings` / `total_weight` instead — the same call the
  ingredient and instruction rules make.

## Recipe Times

`prepTime` / `cookTime` / `totalTime` are **column-backed** as of 0019 — `recipes.{prep,cook,total}_time` (integer seconds, 0020) is the truth, carried on `RecipeDocument` as `prep_time`/`cook_time`/`total_time`. **`SchemaRecipe` has no times at all**, and there is no hydrate-back: the three keys are dead, deleted at the read exit and stripped from every write, like every other promoted field. Full rules → [supabase-data-layer.md](supabase-data-layer.md).

**Seconds inward, ISO 8601 at the edges, and nowhere in between.** Readers take the columns through `formatSeconds`; the editor seeds from them through `formatTimeInput` and writes back through `UpdateRecipePatch.times` in seconds. ISO lives on `SchemaOrgRecipe` only, at four edges: the two outbound builders, a scrape arriving through `createRecipeRow` / `draftRecipeDocument`, and MCP `update_recipe`'s `times` argument.

- **`times` is three-way per member** — the key absent leaves that column alone, `null` clears it, a number sets it. Each member keyed separately, unlike `servings`: one time is a fine state without the other two.
- **`totalTime` is not derived from prep + cook** and must not be — a recipe can have resting or marinating time that belongs to neither.
- **The two strictnesses are deliberate.** MCP `times` REFUSES a duration the app cannot read (`timesInputSchema`, via `isIsoDuration`), because `parseDurationToSeconds` answers null for an unreadable value exactly as it does for a deliberate clear — so accepting one would silently wipe the time the caller meant to set. The create edge is lenient for the opposite reason: a scrape writes whatever the page said, and an import must degrade to "no time" rather than fail. `"PT0M"` is a well-formed zero and passes both.
- **The `ISO_DURATION` regex is `PT`-only, with no day field.** `P4D` and `P1DT13H20M` read as no time; three recipes are affected, listed in [supabase-data-layer.md](supabase-data-layer.md).

**UI:** editing mirrors servings exactly — `TimeYieldStats`'s `timesEdit` prop takes precedence over the static `Stat` cells and forces the band to render, so a recipe with no times can gain them. The cell component `TimeInputCell` lives in its own module in `src/components/` with its own stories (same rule as `Stat` / `ServingsInputCell`). It is **not** `editor/DurationInput` — that is the `m:ss` step timer, where "1:30" is ninety seconds; on a recipe it is an hour and a half. The field is **HH:MM** and re-spells itself on blur, which is what lets it also accept a bare minute count and unit-tagged forms without ambiguity.

## Schema.org JSON-LD Sanitization

Custom fields (`notes`, `cookingNotes`, ingredient group names, row ids) must never appear in the JSON-LD `<script>` output — external tools only understand the standard Schema.org/Recipe spec.

`toSchemaOrgJsonLd(doc, options?)` in `src/lib/format.ts` is the single gatekeeper: it uses an **explicit allowlist** of standard fields, emits `recipeIngredient` as the lines' `raw_text` in group order, `recipeInstructions` from the document's groups, and the times from the document's columns.

**Rules:**
- `@context` and `@type` are emitted as LITERALS, never read from the blob: they name the wire format, so a scraped copy was never worth storing
- A field a recipe actually has is a column, and a column-backed field is built from the document and kept OFF the `optionalFields` allowlist — a key on that list is read straight off the blob, where a frozen copy still sits on older rows. `name`, `image` and `description` follow `schemaOrgTimes` / `schemaOrgYield`'s pattern for exactly that reason
- The allowlist is only for what the blob is still the source of (`recipeCuisine`, `recipeCategory`); a field left off it does not appear in JSON-LD at all
- Any app-internal field (`notes`, `cooking_notes`) must be intentionally left out of `toSchemaOrgJsonLd`
- Ingredient groups and entities are internal-only — only their text crosses this boundary. Instruction groups cross as `HowToSection`s (a nameless run as top-level steps) and a step's timer as `name` + `timeRequired`
