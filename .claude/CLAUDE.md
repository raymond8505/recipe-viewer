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

**UI fetches to `/api/recipes/*` go through `src/lib/api/recipes.ts`** (pattern: `src/lib/api/auth.ts`). No naked fetch in components. Known follow-up: RecipeDetail's `/update`, `/rescrape`, `/regenerate-image` fetches are pre-existing naked fetches not yet wrapped.

**Never import `@/env` in a client component** — t3-env throws on server-var access in the browser. Server components read it and thread the value down as a prop.

## Read the doc when the trigger fires

- **Running `next dev` / Storybook, or setting up a fresh clone** (ports, `.env.yarn`, `MCP_PUBLIC_URL`, what's shared between checkouts) → [docs/parallel-checkouts.md](docs/parallel-checkouts.md)
- **Touching cooking mode** — touch-first tap-target rules, meal sessions, the shopping list → [docs/cooking-mode.md](docs/cooking-mode.md)
- **Touching the cooking-mode timer UI** (`TimerCard`, `DraggableRibbon`, `TimerColumn`) → [docs/timers.md](docs/timers.md)
- **Reading or writing `SchemaRecipe`** — ingredient `group` objects, `recipeYield`/servings, JSON-LD serialization → [docs/recipe-schema.md](docs/recipe-schema.md)
- **Adding or changing anything under `src/app/api/**`, or calling one from the UI** — the auth gate, the dev-only nutrition door, response validation, image upload → [docs/api-routes.md](docs/api-routes.md)
- **Querying Supabase, adding a column, or writing a migration** — `selectColumns<Row>()`, the `src/lib/recipes.ts` repo layer, derived `content`/`embedding` → [docs/supabase-data-layer.md](docs/supabase-data-layer.md)
- **Working on nutrition** — the ingredient catalog, line identity, normalization, USDA, `ScalableRecipe.nutrition()` → [docs/nutrition.md](docs/nutrition.md)
- **Working on the Nutrition Facts label** (`NutritionFactsLabel`, `labelRows.ts`, `NutrientRowTr`) → [docs/nutrition-label.md](docs/nutrition-label.md)
- **Any visual/CSS work** — theme tokens, fonts, badges, shadcn primitives, the radius doctrine → [docs/styling.md](docs/styling.md)
- **Writing or editing a story** — story-vs-test discipline, nav structure, `main.ts` config → [docs/storybook.md](docs/storybook.md)
- **Needing sample data in a story or a test** — a `RecipeRow`/`SchemaRecipe`, a `makeX` factory, a Supabase or fetch mock → [docs/fixtures.md](docs/fixtures.md)
- **Touching `deploy.yml`, `staging.yml`, a compose file, or adding an env var** → [docs/deployment.md](docs/deployment.md)
- **A test times out at 5000ms, or you're loading modules inside a test body** → [docs/testing.md](docs/testing.md)
- **A test fails to *collect* with `Failed to resolve import "../../../c:/…"`** (relative path with an embedded drive letter, usually from the husky pre-push hook, passing when run directly) — known-flaky, usually clears on re-push → [troubleshooting/vite-glob-drive-letter.md](troubleshooting/vite-glob-drive-letter.md)
