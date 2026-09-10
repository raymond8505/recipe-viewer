# Fixtures

`src/fixtures/` is the single home for sample data, shared by **both** stories and vitest tests.
Never define inline `RecipeRow` objects, module-level fixture objects, or `makeX` factories in a
story or a test file — local one-line scaffolding inside a single `it(...)` is fine, anything reused
or shaped goes here. Files are named `src/fixtures/<topic>.ts` with a barrel at `index.ts`.

## The barrel — `import { … } from "@/fixtures"`

| Module | Exports |
| --- | --- |
| `recipes` | `recipeFixtures` (5 real production recipes with Supabase image URLs; `[2]` carries three ingredient groups and two instruction groups), `makeRecipe(id, name, overrides?)` (`ingredients: []` and `instructions: []` by default) |
| `ingredients` | `ingredientFixtures` (real USDA per-100g figures), `makeIngredient` (catalog row), `makeRecipeIngredient(text, overrides?)` (an entity — id `ri-<slug of text>`, parse fields from the deterministic parser), `makeMatchedIngredient(text, catalogRow, overrides?)`, `makeIngredientGroup(name \| undefined, items)`, `makeIngredientLines(texts)` (one nameless group), `makeNutritionLines(total, text?)` (one matched line contributing exactly the whole-recipe `total`), `makeRecipeIngredientRow(recipeId, n, overrides?)` (a table row, for repo tests), `matchedLinesScenario` |
| `instructions` | `makeStep(text, overrides?)` (put the timer — `name` + `seconds` — in overrides), `makeInstructionGroup(name \| undefined, steps)` (texts or ready-made steps), `makeSteps(texts)` (one nameless group) |
| `rescrape` | `rescrapeFixture: SchemaOrgRecipe` (what the webhook returns), `rescrapeResponseFixture` (what `/rescrape` hands the client: `schema` + input groups + instruction groups), `rescrapeSavedFixture` (what `/update` echoes: `schema` + hydrated groups + instruction groups) |
| `nutrition` | `fullSchemaNutrition` (all ten Schema.org nutrients), `sparseSchemaNutrition`, their parsed forms `fullNutrientValues` / `sparseNutrientValues`, and the whole-recipe catalog totals `fullCatalogTotal` / `sparseCatalogTotal` (the same figures × 4 servings) |
| `timers` | `makeTimer` |
| `scalable` | `scalableBaseSchema`, `scalableBaseIngredients` (four nameless lines + a "Wet" group), `quantitativeValueYield`, `makeSchemaRecipe`, `makeScalableRecipe({ schema?, ingredients?, normalized? }, state?)`, `makeNutritionRecipe(total, { schema?, ingredients?, fullyCovered? }, state?)`, `makeScaledIngredient(text, scale?)` |

**A recipe only has nutrition if you give it a catalog total.** `schema.nutrition` is stored but never read back (see [nutrition.md](nutrition.md)), so a fixture carrying it renders nothing — `makeScalableRecipe`'s `normalized` option, or `makeNutritionRecipe`, is the only way to put numbers in front of the panel. `makeNutritionRecipe` bakes in the shape nearly every panel case wants (four servings, no ingredient groups, `fullyCovered: true`) and takes the **whole-recipe** total, so pass `1400` kcal to read "350 kcal" per serving; `fullyCovered: false` is the "some line is unmatched" case, where nothing resolves. `scalableBaseSchema` deliberately keeps its own `nutrition` block — inert, and useful for proving it's ignored. At the `RecipeRow`/document level (RecipeDetail, CookingMode — which derive nutrition from the lines they hold) the equivalent is `makeNutritionLines(total)`: one matched line whose catalog row carries `total` per 100 g at a stored 100 g, so it contributes exactly `total`; add a plain text line beside it for the unmatched case.

Ingredient groups in a story or test are built from text: `makeIngredientLines(["2 cups flour"])` for an ungrouped list, `makeIngredientGroup("Sauce", [...])` per named group, `makeMatchedIngredient(text, catalogRow)` when the line must carry its catalog data. The entity's id is derived from its text, so an assertion can name a line without a lookup; pass `id` in the overrides when two lines share their text. Instruction groups follow the same shape: `makeSteps(["Boil."])` for a nameless run, `makeInstructionGroup("Sauce", ["Simmer.", makeStep("Rest.", { name: "Rest", seconds: 60 })])` per named group.

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
