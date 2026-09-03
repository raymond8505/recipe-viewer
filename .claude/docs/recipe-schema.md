# Recipe Schema — Custom Fields and Serialization

## Ingredient Grouping System

The app uses a custom schema that extends Schema.org/Recipe. Individual ingredients in `recipeIngredient` can be either plain strings (accepted on the way *in*) or objects with the following shape:

```ts
{ name: string; group?: string; id?: string }
```

- `name` — the ingredient text (e.g. `"1 tsp cumin"`)
- `group` — optional; when set, its value matches the `name` of a `HowToSection` in `recipeInstructions`
- `id` — the `recipe_ingredients` row this line **is** (`db/migrations/0016`). Every line composed *out* of storage carries one; it is optional only inbound, where a caller (MCP `update_recipe`, a re-scrape) may send bare strings and the write path mints a row for each.

**This shape is in-memory only.** It is what `composeRecipeSchema` produces and what the write path accepts — it is not how the recipe is stored. Storage is `recipes.ingredients` (groups of row ids) plus `recipe_ingredients.raw_text`; see [supabase-data-layer.md](supabase-data-layer.md).

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

## Schema.org JSON-LD Sanitization

Custom fields (`notes`, ingredient `group` objects) must never appear in the JSON-LD `<script>` output — external tools only understand the standard Schema.org/Recipe spec.

`toSchemaOrgJsonLd(schema)` in `src/lib/format.ts` is the single gatekeeper: it uses an **explicit allowlist** of standard fields and normalizes `recipeIngredient` objects to plain strings via `getIngredientText`.

**Rules:**
- Any new standard Schema.org/Recipe property added to `SchemaRecipe` must also be added to the `optionalFields` array in `toSchemaOrgJsonLd`, or it won't appear in JSON-LD output
- Any new custom/app-level field on `SchemaRecipe` must be intentionally left out of `toSchemaOrgJsonLd`
- `recipeIngredient` objects (`{ name, group, id }`) are internal-only — always flatten to strings before external serialization. `id` is a row primary key and `group` is a custom field; neither belongs in JSON-LD.
