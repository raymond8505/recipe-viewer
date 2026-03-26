# Recipe Viewer — Project Instructions

## Cooking Mode is touch-first

Cooking mode is designed for use on a tablet or phone while actively cooking — often with wet or dirty hands.

- All interactive elements must have large tap targets (minimum 44×44px)
- Do not rely on hover states for anything functional (touch devices have no hover)
- Avoid small controls or precision-required interactions
- Prefer bold visual affordances: large buttons, visible drag handles, high-contrast feedback
- Cursor styles (`cursor-pointer`, `cursor-ns-resize`, etc.) are fine for desktop polish but are not the primary affordance signal

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

## Schema.org JSON-LD Sanitization

Custom fields (`notes`, ingredient `group` objects) must never appear in the JSON-LD `<script>` output — external tools only understand the standard Schema.org/Recipe spec.

`toSchemaOrgJsonLd(schema)` in `src/lib/format.ts` is the single gatekeeper: it uses an **explicit allowlist** of standard fields and normalizes `recipeIngredient` objects to plain strings via `getIngredientText`.

**Rules:**
- Any new standard Schema.org/Recipe property added to `SchemaRecipe` must also be added to the `optionalFields` array in `toSchemaOrgJsonLd`, or it won't appear in JSON-LD output
- Any new custom/app-level field on `SchemaRecipe` must be intentionally left out of `toSchemaOrgJsonLd`
- `recipeIngredient` objects (`{ name, group }`) are internal-only — always flatten to strings before external serialization
