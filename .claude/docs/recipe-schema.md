# Recipe Schema — Custom Fields and Serialization

## Ingredient Grouping System

The app uses a custom schema that extends Schema.org/Recipe. Individual ingredients in `recipeIngredient` can be either plain strings (legacy/ungrouped) or objects with the following shape:

```ts
{ name: string; group?: string }
```

- `name` — the ingredient text (e.g. `"1 tsp cumin"`)
- `group` — optional; when set, its value matches the `name` of a `HowToSection` in `recipeInstructions`

**Rendering rule:** if any ingredient has a `group` value, all ingredients are partitioned into labeled sections using `group` as the heading. Ingredients without `group` fall into an unlabeled section. If no ingredient has `group`, the list renders flat with no section headings.

The helpers that implement this live in `src/lib/format.ts`:
- `getIngredientText(ingredient)` — extracts the display string from either format
- `groupIngredients(ingredients)` — returns `{ heading: string | null; items: [...] }[]` in insertion order

## Base Servings Editing

Edit mode edits the recipe's **base servings** (persisted `recipeYield`), distinct from the `ServingsControl` stepper which only scales the display. `recipeYield` is `string | string[] | QuantitativeValue`; `parseServings` (read) and `applyServings` (write-back) in `src/lib/units.ts` are inverses: `parseServings(applyServings(yld, n)) === n`.

- **`applyServings` preserves shape:** QV keeps `unitText`/`valueReference` (whole-recipe weight — per-serving weight recomputes); strings get their first amount token replaced ("Makes 6" → "Makes 8"); ranges and arrays deliberately collapse to a single string; no/unparseable yield becomes `{ "@type": "QuantitativeValue", value: n }`.
- **`useRecipeEditor.buildSchema` only applies servings when the parsed input differs from `parseServings(base.recipeYield)`.** Load-bearing: `"6-8 servings"` seeds the input with midpoint "7", so an untouched save must not collapse the range (regression test in `useRecipeEditor.test.ts`). Invalid input (blank/non-integer/<1) degrades to "no change" — it never blocks Save.
- **UI:** `TimeYieldStats`'s `servingsEdit` prop takes precedence over the stepper and forces the band to render even with zero stats (so a yield-less recipe can gain one). The band's cell components `Stat` and `ServingsInputCell` live in their own modules in `src/components/` with their own stories (PR #60 review) — don't fold them back in.
- A heavyweight multi-field `YieldEditor` was removed in 7e81735; don't re-add whole-yield editing, servings-only is intentional.

## Recipe Times

`prepTime` / `cookTime` / `totalTime` are **column-backed** as of 0019 — the values you read off `SchemaRecipe` were hydrated from `recipes.{prep,cook,total}_time` (integer seconds, 0020) by the repo layer, and the copies in the stored blob are dead. Full rules → [supabase-data-layer.md](supabase-data-layer.md).

Two consequences for anything touching `SchemaRecipe`:
- The three fields are `string | null`, not `string | undefined`. `null` is a **clear**; omitting the key means "leave it alone". `toSchemaOrgJsonLd` already guards with `!= null`, so a cleared time drops out of JSON-LD correctly.
- `totalTime` is **not** derived from prep + cook and must not be — a recipe can have resting or marinating time that belongs to neither.

**UI:** editing mirrors servings exactly — `TimeYieldStats`'s `timesEdit` prop takes precedence over the static `Stat` cells and forces the band to render, so a recipe with no times can gain them. The cell component `TimeInputCell` lives in its own module in `src/components/` with its own stories (same rule as `Stat` / `ServingsInputCell`). It is **not** `editor/DurationInput` — that is the `m:ss` step timer, where "1:30" is ninety seconds; on a recipe it is an hour and a half. The field is **HH:MM** and re-spells itself on blur, which is what lets it also accept a bare minute count and unit-tagged forms without ambiguity.

## Schema.org JSON-LD Sanitization

Custom fields (`notes`, ingredient `group` objects) must never appear in the JSON-LD `<script>` output — external tools only understand the standard Schema.org/Recipe spec.

`toSchemaOrgJsonLd(schema)` in `src/lib/format.ts` is the single gatekeeper: it uses an **explicit allowlist** of standard fields and normalizes `recipeIngredient` objects to plain strings via `getIngredientText`.

**Rules:**
- Any new standard Schema.org/Recipe property added to `SchemaRecipe` must also be added to the `optionalFields` array in `toSchemaOrgJsonLd`, or it won't appear in JSON-LD output
- Any new custom/app-level field on `SchemaRecipe` must be intentionally left out of `toSchemaOrgJsonLd`
- `recipeIngredient` objects (`{ name, group }`) are internal-only — always flatten to strings before external serialization
