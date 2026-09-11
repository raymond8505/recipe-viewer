# Recipe Viewer — Project Instructions

This file is an **index**: repo-wide conventions that constrain any file you might open, then
triggers pointing at the doc for each subsystem. Detail lives in `.claude/docs/` — read the doc when
its trigger fires, not before. When adding an instruction, decide which of the two it is; anything
scoped to one component, subsystem or workflow is a trigger + a doc, however short.

## Repo-wide conventions

**Pure functions must not live inside component files** (PR #26 review). Two homes:
- **Recipe-wide pure logic** → `src/lib/format.ts` (e.g. `formatMS`/`parseMS` sit beside `formatDuration`/`parseDurationToSeconds`). `format.ts` is client-safe — importable from `"use client"` components.
- **Editor-specific pure logic** (drag/group-tree math) → co-located `*Helpers.ts` / `dragIds.ts` in `src/components/editor/` (e.g. `groupHelpers.ts`'s `findGroupIndexByItem`/`containerIndexOf`).

Unit tests follow the code: helpers moved into `format.ts` are tested in `format.test.ts`; component files keep only component tests.

**All icon components live in `src/components/icons/`** — one file per icon, barrel at `src/components/icons/index.ts`. Import from `@/components/icons`. Do not define icon components inline in feature files.

**`invisible` not conditional render** — the copy button is always in the DOM (using Tailwind `invisible` when disabled) so it never shifts the heading layout. Apply this pattern to any button that appears next to a heading.

**UI fetches to `/api/recipes/*` go through `src/lib/api/recipes.ts`** (pattern: `src/lib/api/auth.ts`). No naked fetch in components. Known follow-up: RecipeDetail's `/rescrape` and `/regenerate-image` fetches are still naked, not yet wrapped.

**A recipe's ingredients are `RecipeIngredientGroup[]` of `RecipeIngredient` entities and its instructions `RecipeInstructionGroup[]` of `RecipeStep`s, never a Schema.org `recipeIngredient` or `recipeInstructions` array** — those arrays exist only at the four external edges (JSON-LD, the image webhook, the window API, scraped input). `SchemaRecipe` has neither field; read them off `RecipeRow` / `RecipeDocument` (`.ingredients`, `.instructions`).

**Never import `@/env` in a client component** — t3-env throws on server-var access in the browser. Server components read it and thread the value down as a prop.

**A type a client module needs lives in `src/types/*` or `src/lib/schemas/*`, never in a repo module** (PR #76 review). `@/lib/recipes` reaches `@/env` through Supabase and the embedding client, so importing a type from it makes the `type` keyword load-bearing punctuation: drop it in a later edit and the service-role client lands in the browser bundle with no compile error. Declare the type somewhere with no server runtime and let the repo module re-export it for its own callers — that is why `RecipeStatus` sits beside its zod enum in `lib/schemas/recipe.ts` and `SortOption` in `types/recipe.ts`. Where a pure `src/types` union hand-mirrors a schema one, pin them with `Assert<Assignable<…>>` from `@/lib/exhaustive`, **in source** — tsconfig excludes `src/__tests__`, so an assertion written there checks nothing.

## Read the doc when the trigger fires

- **Running `next dev` / Storybook, or setting up a fresh clone** (ports, `.env.yarn`, `MCP_PUBLIC_URL`, what's shared between checkouts) → [docs/parallel-checkouts.md](docs/parallel-checkouts.md)
- **Touching cooking mode** — touch-first tap-target rules, meal sessions, the shopping list → [docs/cooking-mode.md](docs/cooking-mode.md)
- **Touching the cooking-mode timer UI** (`TimerCard`, `DraggableRibbon`, `TimerColumn`) → [docs/timers.md](docs/timers.md)
- **Reading or writing `SchemaRecipe`, a recipe's ingredients or its instructions** — `RecipeIngredientGroup`/`RecipeIngredient`, `RecipeInstructionGroup`/`RecipeStep`, the Schema.org edges (`toSchemaOrgJsonLd`/`fromSchemaOrgIngredients`/`fromSchemaOrgInstructions`), `recipeYield`/servings → [docs/recipe-schema.md](docs/recipe-schema.md)
- **Adding or changing anything under `src/app/api/**`, or calling one from the UI** — the auth gate, the dev-only nutrition door, response validation, image upload → [docs/api-routes.md](docs/api-routes.md)
- **Querying Supabase, adding a column, or writing a migration** — `selectColumns<Row>()`, the `src/lib/recipes.ts` repo layer, `recipes.ingredients` + `recipe_ingredients` (hydrate/reconcile, the write order), `recipes.instructions` (canonical form, the dead blob keys), derived `content`/`embedding` → [docs/supabase-data-layer.md](docs/supabase-data-layer.md)
- **Working on nutrition** — the ingredient catalog, row identity, normalization, USDA, `ScalableRecipe.nutrition()`, NutritionDetail → [docs/nutrition.md](docs/nutrition.md)
- **Working on the Nutrition Facts label** (`NutritionFactsLabel`, `labelRows.ts`, `NutrientRowTr`) → [docs/nutrition-label.md](docs/nutrition-label.md)
- **Any visual/CSS work** — theme tokens, fonts, badges, shadcn primitives, the radius doctrine → [docs/styling.md](docs/styling.md)
- **Writing or editing a story** — story-vs-test discipline, nav structure, `main.ts` config → [docs/storybook.md](docs/storybook.md)
- **Writing, rewriting, or migrating any story or test file** — every shaped or repeated object in it (a `RecipeRow`/`SchemaRecipe`, a `makeX` factory, a Supabase or fetch mock) → [docs/fixtures.md](docs/fixtures.md)
- **Touching `deploy.yml`, `staging.yml`, a compose file, or adding an env var** → [docs/deployment.md](docs/deployment.md)
- **A test times out at 5000ms, or you're loading modules inside a test body** → [docs/testing.md](docs/testing.md)
- **A test fails to *collect* with `Failed to resolve import "../../../c:/…"`** (relative path with an embedded drive letter, usually from the husky pre-push hook, passing when run directly) — known-flaky, usually clears on re-push → [troubleshooting/vite-glob-drive-letter.md](troubleshooting/vite-glob-drive-letter.md)
