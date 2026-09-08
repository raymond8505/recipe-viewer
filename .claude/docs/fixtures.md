# Fixtures

`src/fixtures/` is the single home for sample data, shared by **both** stories and vitest tests.
Never define inline `RecipeRow` objects, module-level fixture objects, or `makeX` factories in a
story or a test file — local one-line scaffolding inside a single `it(...)` is fine, anything reused
or shaped goes here. Files are named `src/fixtures/<topic>.ts` with a barrel at `index.ts`.

## The barrel — `import { … } from "@/fixtures"`

| Module | Exports |
| --- | --- |
| `recipes` | `recipeFixtures` (5 real production recipes with Supabase image URLs; `[2]` carries three ingredient groups), `makeRecipe(id, name, overrides?)` (`ingredients: []` by default) |
| `ingredients` | `ingredientFixtures` (real USDA per-100g figures), `makeIngredient` (catalog row), `makeRecipeIngredient(text, overrides?)` (an entity — id `ri-<slug of text>`, parse fields from the deterministic parser), `makeMatchedIngredient(text, catalogRow, overrides?)`, `makeIngredientGroup(name \| undefined, items)`, `makeIngredientLines(texts)` (one nameless group), `makeRecipeIngredientRow(recipeId, n, overrides?)` (a table row, for repo tests), `matchedLinesScenario` |
| `rescrape` | `rescrapeFixture: SchemaOrgRecipe` (what the webhook returns), `rescrapeResponseFixture` (what `/rescrape` hands the client: `schema` + input groups), `rescrapeSavedFixture` (what `/update` echoes: `schema` + hydrated groups) |
| `nutrition` | `fullSchemaNutrition` (all ten Schema.org nutrients), `sparseSchemaNutrition`, and their parsed forms `fullNutrientValues` / `sparseNutrientValues` |
| `timers` | `makeTimer` |
| `scalable` | `scalableBaseSchema`, `scalableBaseIngredients` (four nameless lines + a "Wet" group), `quantitativeValueYield`, `makeSchemaRecipe`, `makeScalableRecipe({ schema?, ingredients? }, state?)`, `makeScaledIngredient(text, scale?)` |

Ingredient groups in a story or test are built from text: `makeIngredientLines(["2 cups flour"])` for an ungrouped list, `makeIngredientGroup("Sauce", [...])` per named group, `makeMatchedIngredient(text, catalogRow)` when the line must carry its catalog data. The entity's id is derived from its text, so an assertion can name a line without a lookup; pass `id` in the overrides when two lines share their text.

## Test-only fixtures are direct-import, not in the barrel

`supabase.ts` (`makeSupabaseClient`, the queue-based repo-test client), `response.ts`
(`makeResponse`), `request.ts` (`makeJsonRequest`), and `usda.ts` (real captured FoodData Central
payloads) are **deliberately absent from `index.ts`**. Import them by path —
`import { makeSupabaseClient } from "@/fixtures/supabase"`.

The rule: anything that imports vitest, or is test-only infra, stays out of the barrel. Stories
import `@/fixtures`, and vitest must never reach the Storybook bundle. When you add a fixture module,
decide which side of that line it falls on before touching `index.ts`.

`src/fixtures` **is** type-checked by tsc — only `src/__tests__` is excluded — so fixture types must
be exact. E.g. `BodyInit` requires `Uint8Array<ArrayBuffer>`, not bare `Uint8Array`.

## Fixture images

The `recipeFixtures` image URLs are real production Supabase storage
(`https://xonkmdhnjpjkapnsmltu.supabase.co/storage/v1/object/recipes/...`). If a story shows broken
images, check `next.config.js` `images.domains`.

## USDA payloads

`usda.ts` holds trimmed real FoodData Central responses that lock in upstream shape quirks. Why those
specific quirks matter is in [nutrition.md](nutrition.md) — read it before editing them.
