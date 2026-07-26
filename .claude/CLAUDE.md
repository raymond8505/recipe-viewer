# Recipe Viewer — Project Instructions

## Cooking Mode is touch-first

Cooking mode is designed for use on a tablet or phone while actively cooking — often with wet or dirty hands.

- All interactive elements must have large tap targets (minimum 44×44px)
- Do not rely on hover states for anything functional (touch devices have no hover)
- Avoid small controls or precision-required interactions
- Prefer bold visual affordances: large buttons, visible drag handles, high-contrast feedback
- Cursor styles (`cursor-pointer`, `cursor-ns-resize`, etc.) are fine for desktop polish but are not the primary affordance signal

## Editor Helper Placement

Pure functions must not live inside component files (PR #26 review). Two homes:
- **Recipe-wide pure logic** → `src/lib/format.ts` (e.g. `formatMS`/`parseMS` sit beside `formatDuration`/`parseDurationToSeconds`). `format.ts` is client-safe — importable from `"use client"` components.
- **Editor-specific pure logic** (drag/group-tree math) → co-located `*Helpers.ts` / `dragIds.ts` in `src/components/editor/` (e.g. `groupHelpers.ts`'s `findGroupIndexByItem`/`containerIndexOf`).

Unit tests follow the code: helpers moved into `format.ts` are tested in `format.test.ts`; component files keep only component tests.

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

## TimerCard Layout

`src/components/cooking/TimerCard.tsx` uses a **three-column layout** for running/paused/finished states:
- **Left col (`w-12`, fixed):** play/pause icon (top) + reset (bottom). The icon button has `aria-label` of just the action ("Pause", "Resume", or "Restart") — shorter than the middle-col label ("Pause {name}" etc.) to avoid duplicate-label test failures. The **SVG icons inside** (`PauseIcon`, `PlayIcon`) carry `aria-hidden="true"`. Do NOT put `aria-hidden` on the button itself — the button must be in the tab order.
- **Middle col (`flex-1`):** name + time, rendered as a `<button>` that calls `onTogglePause` (running/paused) or `onReset` (finished). This is the primary accessible tap target and carries the full aria-label.
- **Right col (`w-12`, fixed):** edit (top) + delete (bottom).

**Alarm state is intentionally 2-column** (dismiss left, reset+delete right) — there is no play/pause concept. Do not normalize it to 3-column.

**TimerCard tests (`src/__tests__/TimerCard.test.tsx`) use aria-label regexes.** Before renaming any button label, grep the test file for the old string — broken labels cause hard `getByLabelText` failures, not soft mismatches.

**Duplicate aria-label = hard `getByLabelText` failure.** If two buttons share the same aria-label, Testing Library throws rather than returning the first match. Guard against this when adding redundant visual affordances alongside accessible tap targets.

## Timer Container — Two Views

The phrase "timer container" refers to the timer UI in **both** orientations:
- **Portrait / mobile (`lg:hidden`):** horizontal `DraggableRibbon` strip at the top of the screen
- **Landscape / desktop (`lg:flex`):** vertical `TimerColumn` on the right side

Both views render the same timer data. When making changes to timer display, interaction, or scroll behaviour, both views must be updated. Both render `<div data-timer-id={timer.id}>` wrappers around each `TimerCard` so features can target timers by ID in either view with `querySelectorAll` (not `querySelector` — both elements exist in the DOM simultaneously, only one is visible via CSS).

## Meal Mode in Cook Mode

Cook mode supports grouping multiple recipes into a "meal" session. State lives in `CookingMode.tsx` as plain `useState` — no context or hook.

**Key invariants:**
- `mealRecipes[0]` is always the primary recipe and cannot be removed
- `activeSchema = activeIndex === 0 ? schema : mealRecipes[activeIndex].metadata.schema` — the `schema` variable is the primary recipe's schema, which can be overridden by the window API; `activeSchema` is what drives ingredients/instructions/notes rendering
- `useScaling` is called once on the primary recipe's `recipeYield`; non-primary recipes get `scale={1}` with no `onScaleChange` — scaling is intentionally primary-only for now
- All timers (primary + added recipes) land in a single localStorage bucket keyed by the primary recipe's URL hash. Timers from added recipes are seeded imperatively in `handleAddToMeal` and are **not** deduplicated — if a recipe is added a second time its timers are re-seeded

**Step completion** is tracked per-recipe via `completedStepsMap: Map<recipe.id, Set<string>>`. Step keys (`"i-j"` or `"i"`) are only unique within a recipe's own bucket.

**MealTabs pattern:** closable tabs use two adjacent `<button>` elements (tab name + ×) inside a flex `<div>` — NOT a button inside a button (invalid HTML). The × has `tabIndex={-1}` and is outside the roving tabindex cycle. All tab buttons share `aria-controls="meal-recipe-panel"` pointing to the single panel ID in CookingMode.

**MealSearch** is always rendered (no toggle). Click-outside clears query; ArrowDown from input moves focus to first result; ArrowUp from first result returns to input.

## Shopping List Feature

Ingredients in both `CookingMode` and `RecipeDetail` are tappable checkboxes that build a shopping list, copied to clipboard as newline-separated text.

**State:**
- `CookingMode`: `Set<string>` keyed as `"${recipeId}::${ingredientText}"` — shared across all meal recipes in a session
- `RecipeDetail`: `Set<string>` keyed by bare ingredient text — separate, no cross-mode sharing

**Copy output is raw ingredient text, not scaled.** `getIngredientText(ing)` is used — the original schema string, ignoring current scale. Intentional: shopping is about what to buy, not cook-time quantities.

**Primary recipe copy reads from `schema` (live state), not `mealRecipes[0].metadata.schema`** — preserves window API overrides. Don't flatten this.

**All icon components live in `src/components/icons/`** — one file per icon, barrel at `src/components/icons/index.ts`. Import from `@/components/icons`. Do not define icon components inline in feature files.

**`invisible` not conditional render** — the copy button is always in the DOM (using Tailwind `invisible` when disabled) so it never shifts the heading layout. Apply this pattern to any button that appears next to a heading.

## Schema.org JSON-LD Sanitization

Custom fields (`notes`, ingredient `group` objects) must never appear in the JSON-LD `<script>` output — external tools only understand the standard Schema.org/Recipe spec.

`toSchemaOrgJsonLd(schema)` in `src/lib/format.ts` is the single gatekeeper: it uses an **explicit allowlist** of standard fields and normalizes `recipeIngredient` objects to plain strings via `getIngredientText`.

**Rules:**
- Any new standard Schema.org/Recipe property added to `SchemaRecipe` must also be added to the `optionalFields` array in `toSchemaOrgJsonLd`, or it won't appear in JSON-LD output
- Any new custom/app-level field on `SchemaRecipe` must be intentionally left out of `toSchemaOrgJsonLd`
- `recipeIngredient` objects (`{ name, group }`) are internal-only — always flatten to strings before external serialization

## Image Upload / Storage

**`src/lib/imageTypes.ts` is the client-safe image config module.** `IMAGE_CONTENT_TYPES` (config object) is the single source for allowed types + extensions; the allowlist, union type, and `extensionForContentType` are all derived from it. `src/lib/storage.ts` re-exports them but **client components must import from `@/lib/imageTypes`** — storage.ts pulls in `node:net` and breaks the client bundle.

**`MAX_IMAGE_BYTES` is an env var** (`src/env.ts`, zod default `DEFAULT_MAX_IMAGE_BYTES` = 4MB from imageTypes.ts). Server code reads `env.MAX_IMAGE_BYTES`. Client components get it as a `maxImageBytes` prop from the server page (`recipes/[id]/page.tsx`) — **never import `@/env` in a client component**; t3-env throws on server-var access in the browser.

**UI fetches to `/api/recipes/*` go through `src/lib/api/recipes.ts`** (pattern: `src/lib/api/auth.ts`). No naked fetch in components. Known follow-up: RecipeDetail's `/update`, `/rescrape`, `/regenerate-image` fetches are pre-existing naked fetches not yet wrapped.

**Route handler params use Next 16's generated global `RouteContext<'/api/recipes/[id]/...'>`** — no import needed; types come from `.next/types` (in tsconfig include). Don't hand-write `{ params: Promise<{ id: string }> }`.

## Webhook / API Response Handling

When a handler calls a state setter with data from `fetch` or a webhook response:

1. **Never trust TypeScript type assertions on `res.json()`** — they are erased at runtime and do not validate shape. `as { schema: SchemaRecipe }` is a cast, not a parse.
2. **Guard before the state setter**: check that the expected key is present (e.g. `if (!result.schema) throw new Error()`) so a malformed 200 response falls into the existing error state rather than setting state to `undefined`.
3. **A state setter that receives `undefined` will not throw at the call site** — the crash happens on the next render when code accesses a property on the undefined value. Always validate at the boundary.

## API Route Conventions

**Auth gate.** Every route under `src/app/api/**` is classified in `src/lib/api/routePolicy.ts` — the single source of truth for its exposure level. `src/__tests__/route-auth-policy.test.ts` is a **build-breaking gate**: it fails if a route file has no registry entry (or an entry has no file), and it invokes every *protected* route unauthenticated and asserts 401/403. A new route can't ship without an explicit auth decision. Enforce auth with the wrappers in `src/lib/api/guard.ts` — `requireSession` (browser session) or `requireSessionOrRecipeToken` (session OR recipe-scoped capability token, the agent path); don't hand-roll inline checks. Anonymous routes are an explicit allowlist (`public-read` / `oauth-public` / `public-auth`), each with a written rationale. `GET /api/recipes` is `public-read` — anonymous browse/search backs the public UI including cook mode; the `x-requested-by` header is **not** the security boundary (visibility is filtered server-side by `getRecipes`).

**Data access.** Route handlers must **not** call `getSupabaseClient().from("recipes")` directly — go through `src/lib/recipes.ts` (`getRecipeById`, `updateRecipeRow`, `archiveRecipe`, `createRecipeRow`) and map `RecipeRepoError` → 404 (`not_found`) / 500. `updateRecipeRow` **merges** the schema patch into `metadata.schema` (not replace) and syncs the top-level `name` column — relying on this is what keeps list/search columns from going stale. In tests, mock `@/lib/recipes` at the module boundary with `importOriginal` so `RecipeRepoError` stays real for `instanceof`. (OAuth routes still use raw `oauth_*` Supabase calls — there is no repo layer for those yet.)

**Derived `content` + `embedding` columns.** Both write helpers (`createRecipeRow`, `updateRecipeRow`) derive two columns from the `SchemaRecipe` so the MCP and UI paths produce them identically:
- **`content`** (NOT NULL) is the full markdown rendering of the recipe via `schemaToMarkdown` — recomputed on every create and on any schema-touching update. (This is also the exact text that gets embedded.)
- **`embedding`** (nullable `vector(768)`) is a best-effort Gemini embedding of that markdown via `generateEmbedding`. If generation returns `null` (e.g. Google is down) the write still succeeds — the column is omitted on insert and the prior vector is left untouched on update; it is never nulled.
- Embeddings are stored **raw (un-normalized)**: they're queried with pgvector cosine distance (`<=>`), which is scale-invariant, so normalizing would be a no-op and would also split the column's scale from the older n8n-written rows.
- Neither column is in `RECIPE_COLUMNS`, so both are **write-only** — not read back onto `RecipeRow`.

## Ingredient Catalog & Matching (PR #40)

**PostgREST select lists go through `selectColumns<Row>()`** (`src/lib/supabase.ts`) — never hand-write a comma-delimited column string. It compile-checks the list against the row type in both directions (unknown column rejected; missing column named in the error) and enforces write-only columns (`embedding`, `content`) by their absence from the Row type. Its return type is the joined string **literal** (template-literal `Join`) — this is load-bearing: supabase-js infers result row types by parsing the select string's literal type, and a plain `string` degrades results to `GenericStringError`, breaking single-cast `data as Row` sites.

**`ingredients.embedding` is NOT NULL** (migration 0006): `CreateIngredientInput.embedding` is required and `UpdateIngredientPatch.embedding` can replace but never clear. Rationale: an embedding-less row is invisible to matching → every line resolving to it would be misclassified as novel.

**`match_ingredients` is hybrid keyword + semantic** (migration 0007): pg_trgm trigram similarity over `name` + each alias (best-of), fused with pgvector cosine via Reciprocal Rank Fusion (`rrf_k=50`, per-signal weights, all defaulted in SQL). Returns `semantic_similarity`, `keyword_similarity`, `score`. **Never threshold on `score`** — RRF is rank-only; threshold on the raw similarities (keyword ~1.0 = near-exact name/alias hit). Trigram was chosen over tsvector deliberately: ingredient names are 1–4 words where `ts_rank_cd` is meaningless and stemmed FTS misses typos. The single scored-CTE seq scan is intentional at catalog scale; the Supabase docs' two-limited-CTE + trgm/hnsw-index shape is the upgrade path if the catalog grows large.

**Migration records in `db/migrations/` are applied out-of-band** via Supabase MCP `apply_migration` (project `xonkmdhnjpjkapnsmltu`); 0006+ show up in the project's migrations table, 0002–0005 predate that and don't — check `information_schema` for actual state, not the migrations list.

## Styling Layer — Keep It Centralized

The styling layer has **single sources of truth**. Do not re-declare style decisions at call sites — thread them back to these homes so the site and Storybook (and every component) stay in sync.

**Theme colors → `src/app/globals.css`.** Color decisions live as CSS tokens: values in `:root`, util mappings in the `@theme inline` block. The palette is **warm neutral** (June 2026 redesign): a plain `@theme` block remaps the whole `--color-gray-*` scale to stone oklch literals — so raw `gray-*` utilities render warm — and the surface tokens are warm literals (`--card`/`--popover` warm paper, `--background` stone-50). Brand stays `--brand: var(--color-orange-600)`.
- **Gray-remap gotcha:** the remap must stay in a plain `@theme` block with **literal** oklch values. Moving it into `@theme inline` (or referencing `var(--color-stone-*)`) breaks it silently — inline vars aren't emitted at `:root`, and unused palette vars are tree-shaken, which would strand the border-color compat layer and any `var(--color-*)` reference.
- In UI components use **theme-token utilities** (`bg-card`, `text-card-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`, `text-brand`, `bg-brand-subtle`) — **not** raw palette utilities (`bg-white`, `text-gray-900`, `text-orange-600`).
- A new semantic/brand color is a **new token** (add to `:root` + `@theme inline`), never a hardcoded hex/gray sprinkled across components.
- Exception: genuinely one-off *semantic status* colors with no theme meaning (e.g. the green/amber/gray status pill) may stay as explicit classes, but only inside their own named component.

**Global "chrome" (fonts + page surface) → `src/components/AppChrome.tsx`.** The `next/font` loaders are called **once** here: `bodyFont = Figtree(...)` on `--font-sans` and `headingFont = Source_Serif_4(...)` on `--font-heading` (with `axes: ["opsz"]`), alongside `APP_SURFACE_CLASS` (`bg-background min-h-screen`) and the `AppChrome` wrapper. This is the only place that decides the app fonts and page surface. The real site (`src/app/layout.tsx`) puts both `.variable`s on `<html>` and `bodyFont.className` on `<body>`; Storybook (`.storybook/preview.tsx` global decorator) wraps every story in `<AppChrome>`. Both consume the same source, so stories render with the same chrome as production. Never call a font loader or set the background/font on an individual page/story — change `AppChrome`.
- Top-level loader calls in this shared module are statically analyzable, so both Next's `next/font` transform and Storybook's vite plugin pick them up — verified with `next build` + `build-storybook`. (An earlier note claimed the loader had to be duplicated per compiled entry; that was overcautious — it does **not**.)
- **Typography language (June 2026 redesign):** headings are serif-light — a base-layer rule puts `font-heading font-light` on `h1`–`h6`; body defaults to `font-light` Figtree. Eyebrow labels (uppercase + tracking-widest section headers) opt back into `font-sans font-semibold`. Non-h-tag elements that mirror headings (`RecipeTitleInput`, the header logo) carry explicit `font-heading` classes. Don't reintroduce `font-bold` on headings — hierarchy comes from size.

**Purpose-built badges/pills → named components wrapping a shadcn primitive.** Never inline a styled `<Badge>` or a hand-rolled `<span>` pill in a feature component. Each badge variant is its own named component that wraps `@/components/ui/badge` and owns its styling + logic — e.g. `RecipeStatusBadge` (status normalization + status colors), `RecipeCategoryBadge` (brand accent). This mirrors the icon-component rule (see Shopping List Feature). The shadcn primitive's base already supplies padding/size/weight — the wrapper sets only what differs.

**shadcn primitives → `src/components/ui/`** (generated; treat as unedited). Feature components compose them; overrides go through `className` (twMerge last-wins), not by editing the generated primitive.
- **Deliberate divergence from the registry (June 2026 redesign):** `button.tsx` and `badge.tsx` carry `rounded-full` in their cva bases (site-wide pill shape for interactive elements), and `input.tsx`/`textarea.tsx` are underline fields (`rounded-none border-0 border-b`, no focus ring — focus is `focus-visible:border-brand`). These are the sanctioned kind of primitive edit (global shape re-themes tokens can't express). If any of these files is ever regenerated from the registry, re-apply the divergence. Raw `<input>`/`<select>` elements in feature files follow the same underline pattern with `focus:border-orange-400`.
- **Radius doctrine:** the `--radius-sm..4xl` scale in `globals.css` is **flattened** — every `rounded-sm..4xl` utility renders `var(--radius)` (2px). Surfaces are near-square; only `rounded-full` escapes. Don't "fix" a call site by swapping `rounded-lg` for `rounded-xl` — they're identical; change `--radius` if the tightness is wrong.
- These are the **`radix-nova`** style (per `components.json`), not vanilla shadcn — quirks worth knowing when matching a hand-rolled look: `Card` uses `ring-1 ring-foreground/10` (not `border`) + a `--card-spacing` var for padding/gap; `CardTitle` is a plain `<div>` with **no `asChild`**.

## Story Fixtures

All shared `RecipeRow` fixtures — used by both stories and tests — live in `src/fixtures/` and import via `@/fixtures`. Never define inline `RecipeRow` objects in story files.

- `recipeFixtures: RecipeRow[]` — 5 real production recipes with Supabase image URLs
- `makeRecipe(id, name, overrides?)` — minimal factory for one-off fixture needs
- `sources: string[]` — real source values from the fixture recipes
- `rescrapeFixture: SchemaRecipe` — moved from `src/__tests__/fixtures/`; used by rescrape and update tests

**Real fixture images** are at `https://xonkmdhnjpjkapnsmltu.supabase.co/storage/v1/object/recipes/...` (production Supabase). If a story shows broken images, check `next.config.js` `images.domains`.

**Test-only fixtures are direct-import, not in the barrel:** `src/fixtures/supabase.ts` (`makeSupabaseClient` — shared Supabase client mock for API route tests) imports vitest, and stories import `@/fixtures` — vitest must never reach the Storybook bundle. Import `@/fixtures/supabase` / `@/fixtures/response` directly in test files. Also: `src/fixtures` IS type-checked by tsc (only `src/__tests__` is excluded) — e.g. `BodyInit` requires `Uint8Array<ArrayBuffer>`, not bare `Uint8Array`.

## Story Discipline

**Storybook = visual documentation. vitest = behavioral assertions.** The line: if removing a `play()` block makes the story _less visually informative_, keep it. If it only makes it less tested, delete it.

- Never use `play()` to assert that a mock callback was called — that's a vitest test
- Never mock `global.fetch` in a story to simulate API responses — that's a vitest test
- `play()` is appropriate for demonstrating visual state transitions (e.g. NutritionPanel's portion stepper)

**Controlled-component play() trap:** If a component's visual state is fully driven by props/args (e.g. TimerCard, MealTabs), clicking in `play()` fires a callback but won't change what you see — the arg doesn't update. These play() blocks are always tests. Only keep `play()` when the component has *internal* state the interaction mutates (modal opening, confirm overlay, edit input revealing).

**`useSearchParams` in `@storybook/nextjs-vite`:** Pass `parameters.nextjs.navigation.searchParams: { q: "..." }` — the adapter wraps it in `ReadonlyURLSearchParams` internally, so `.get("q")` returns the expected value. No `play()` workaround needed.

## Storybook Nav Structure

- `Components/Cooking Mode/*` — all cooking session components
- `Components/Recipes/*` — recipe display, filters, search, pagination, card, grid
- `Components/Icons` — icon library (stays at root)

New stories must follow this structure. A story landing at root `Components/X` will look wrong in the sidebar.

## Storybook Configuration

**`main.ts` is loaded as ESM by Storybook 10** — `__dirname` is undefined. Use `path.dirname(fileURLToPath(import.meta.url))` instead (import `fileURLToPath` from `"url"`).

**`viteFinal` runs during both `storybook dev` and `storybook build`.** Always use the `configType` parameter to guard dev-only config:
```ts
viteFinal(config, { configType }) {
  if (configType === "DEVELOPMENT") { /* dev-only */ }
  return config;
}
```

**`config.server.https` set via `viteFinal` is silently ignored.** Storybook runs Express with Vite in middleware mode — `server.*` options have no effect. To enable HTTPS in dev, use CLI flags on the `storybook` script: `--https --ssl-key .storybook/certs/localhost-key.pem --ssl-cert .storybook/certs/localhost.pem`. Cert files live in `.storybook/certs/` (gitignored via `*.pem`); generate with `mkcert localhost 127.0.0.1 ::1` and run `mkcert -install` as Administrator once to trust the local CA.

**Storybook static build is served at `/storybook/` in production.** The Dockerfile runs `yarn build:prod` (= `yarn build-storybook && yarn build`) and copies `public/` into the runner stage. Next.js standalone serves `public/` at matching URL paths. If the runner-stage `COPY --from=builder /app/public ./public` is ever removed, `/storybook/` will silently 404.

**`yarn build:prod` order is load-bearing.** Storybook writes to `public/storybook/` first; `next build` then picks up `public/` into the standalone output. Reversing the order would produce a container where `/storybook/` silently 404s.

## Deploy Workflow — Env Var Enforcement

All server-side env vars are validated at app startup via `src/env.ts` (`@t3-oss/env-nextjs` + zod). A missing or malformed var crashes the container immediately — the deploy health check catches it and fails the deploy. No more silent 503s.

`docker-compose.yml` uses `env_file: .env` — never add vars to the `environment:` block. Adding a new var requires:
1. Add to `src/env.ts` `server:` and `runtimeEnv:` (this is the single source of truth)
2. Add the GitHub Secret in repo Settings → Secrets
3. Wire through `deploy.yml` in 3 places (`env:` block, `envs:` list, `.env` heredoc)

`scripts/validate-deploy-env.sh` enforces step 3 in the CI build job (wired June 2026 — it had been dormant: the `*.sh` gitignore rule kept it out of the repo, so it's committed via `git add -f`; future edits to it need `-f` only if it's ever re-deleted). `SKIP_ENV_VALIDATION` and `NODE_ENV` are excluded from its Rule 1.

**`SKIP_ENV_VALIDATION=1` is set in two places — both load-bearing:**
- `Dockerfile` builder stage: server vars aren't available during `next build`
- `vitest.config.ts` `env:` block: must use `env:` not `setupFiles` (module-level code runs before setup files)

**`vi.stubEnv` doesn't work in tests for vars from `@/env`** — `createEnv` is a module-level singleton; `runtimeEnv` is captured once at import time. Use `vi.mock("@/env", () => ({ env: { VAR: "value" } }))` instead.

**zod `.default()`s in env.ts do NOT apply under vitest** — `skipValidation` returns `runtimeEnv` unparsed, so `env.X` is `undefined` in tests even when the schema has a default. Any test whose import chain reaches the real `@/env` must mock it (with inline literals — `vi.mock` factories are hoisted and can't close over module consts).

## Per-PR Staging Deployments

`.github/workflows/staging.yml` gives every open PR its own live container, separate from the prod `deploy.yml` flow.

- **URL:** `<branch-slug>.new.raymonds.recipes` — the branch name slugified to a DNS label. This rides the existing `*.new.raymonds.recipes` wildcard DNS + Traefik `mytlschallenge` cert resolver. (It is **not** `new-<branch>.raymonds.recipes`, which would need an apex `*.raymonds.recipes` wildcard that doesn't exist.)
- **Identity is keyed on PR number**, not branch: container `recipe-viewer-staging-pr-<n>`, compose project `recipe-viewer-staging-pr-<n>`, Traefik router/service/middleware names all suffixed with `pr-<n>`, and VPS dir `${VPS_DEPLOY_PATH}/staging/pr-<n>`. The branch slug is used **only** for the public host. This keeps `synchronize`/teardown deterministic even if the branch is renamed/deleted.
- **Triggers:** `pull_request` `[opened, synchronize, reopened]` → `deploy-staging`; `[closed]` (merged OR not) → `teardown-staging`. `concurrency: staging-<pr-number>` with `cancel-in-progress` supersedes in-flight deploys.
- **The preview link is surfaced as a GitHub Deployment** (Vercel-style "View deployment" button in the PR / Environments), **not** a comment. The deploy job opens a deployment in environment `staging-pr-<n>` (`in_progress`), then finalizes it `success` with `environment_url=https://<host>` (or `failure`/`inactive`). Teardown marks all deployments in that environment `inactive` (and best-effort deletes the environment — usually 403 under the default `GITHUB_TOKEN`, which is fine). Requires `permissions: deployments: write`.
- **`docker-compose.staging.yml`** is a templated mirror of `docker-compose.yml`: every fixed identifier is interpolated from `PR_ID` / `STAGING_HOST` exported in the deploy script. Keep the two compose files in sync when changing the service (ports, network `n8n_default`, logging, build args).
- **Env:** staging reuses **all** prod secrets and **shares the production Supabase** — reviewers can mutate real data. The only per-PR override is `MCP_PUBLIC_URL`, pointed at the staging host so OAuth/MCP callbacks resolve. **No new GitHub secret** — staging lives under the existing `VPS_DEPLOY_PATH/staging/`.
- **`scripts/validate-deploy-env.sh` now validates BOTH `deploy.yml` and `staging.yml`** (loops over both; each must be self-consistent across the 3 rules). So adding a runtime var means wiring it through staging.yml's `env:`/`envs:`/`.env` heredoc too, not just deploy.yml. Workflow steps that write `$GITHUB_OUTPUT` must use `printf`, **not** the double-quoted `echo` form, or the validator misparses them as `.env` heredoc lines.
- **A PR branched from main before staging.yml + docker-compose.staging.yml were merged won't have these files**, so its staging deploy fails until rebased onto an up-to-date main. Inherent to self-hosting the workflow in-repo.

## Ingredient Manager

Recipes' free-text ingredient lines get a derived structured layer: `recipe_ingredients` rows linking to a canonical `ingredients` catalog (per-100g nutrition + `density_g_per_ml` for volume↔weight conversion, USDA FoodData Central-sourced).

**Parallel-layer invariant:** `SchemaRecipe.recipeIngredient` stays the display source of truth. Normalization NEVER rewrites recipe text — it only derives `recipe_ingredients` rows. Nothing may feed catalog data back into the schema.

**Data layer:**
- DDL records: `db/migrations/0002`–`0005` (numbering continues the better-auth branch's `0001`) — applied out-of-band via Supabase MCP `apply_migration`; the files are review records, there is no runner.
- `ingredients` / `recipe_ingredients` are **RLS-locked with no policies** (service-role-only, like `users`). All access goes through `src/lib/ingredients.ts` on `getSupabaseAdminClient()` — the anon client sees nothing. `ingredients.embedding` is write-only (queried via the `match_ingredients` RPC; similarity = 1 − cosine distance).
- `IngredientRepoError` kinds worth respecting: `conflict` = lower(name) unique-index collision (re-match, don't duplicate); `match_failed` = the RPC broke — **never** treat it as "no matches" (that would classify every line as novel and mint duplicate catalog rows).

**Normalization workflow** (`src/lib/normalization/graph.ts`, LangGraph; nodes are plain async fns over the raw-fetch Gemini/USDA clients — no LangChain model wrappers):
- parse (Flash-Lite structured output; deterministic `parseIngredient` fallback) → embed+match (pgvector top-5; `SIM_AUTO_ACCEPT`/`SIM_NOVEL_FLOOR` exported constants — tune there, nowhere else) → adjudicate ambiguous (Flash-Lite; no verdict → unmatched, never a guessed match) → fetch novel from USDA (catalog name = the PARSED name; USDA description kept as an alias) → persist.
- Failure asymmetry: Gemini fails → degrade; USDA fails → line unmatched but the run completes; `match_failed` → run fails **without persisting**.
- Trigger: `scheduleNormalization` via Next `after()` from `createRecipeRow`/`updateRecipeRow` — only when the ingredient TEXT fingerprint changes (`src/lib/normalization/fingerprint.ts`). The graph module loads via dynamic import inside the callback: route modules must not pull `@langchain/langgraph` statically (the auth-gate test cold-loads every route graph). Two rapid saves resolve deterministically: persist aborts if the recipe's fingerprint moved mid-run.
- Recovery: `POST /api/recipes/[id]/normalize` (session-or-recipe-token) re-runs for the current schema; `yarn backfill:normalization [--limit=N]` processes every recipe whose stored fingerprint is stale (resumable — completed rows self-skip via the fingerprint).

**USDA client** (`src/lib/usda.ts`): the detail fetch uses `format=abridged` — **load-bearing**: the default full format 404s every Foundation record (upstream USDA regression since 2026-07, reproduced with USDA's own DEMO_KEY sample; don't "fix" it back to full). Abridged nutrients are FLAT, keyed by legacy NDB `number` (a string — sugars is 269 on SR Legacy but 269.3 on Foundation; kJ energy sits under 268 and must never win over 208 kcal) and carry NO `foodPortions`, so `food_portions` persists as null and `density_g_per_ml` falls back to a best-effort Gemini estimate (`estimateDensity`, sibling of `estimateLineGrams`; plausibility-capped, null when it declines). `fdc_id` stays on rows, so a re-import can backfill real portions if full format returns. `deriveDensity` (median g/ml over volume portions; SR Legacy hides portion units in `modifier` with `measureUnit` "undetermined") is retained for portion-bearing data. Real abridged payload fixtures in `src/fixtures/usda.ts` lock the shapes in. Search data types pinned to `Foundation,SR Legacy` (per-100g analytical; Branded/FNDDS are label/serving-based). Requires `USDA_API_KEY` (free data.gov key, 1,000 req/hr — the app crashes at startup without it per the env-enforcement design).

**Nutrition resolution — `ScalableRecipe` is the single interface** (`src/lib/ScalableRecipe.ts`): `nutrition()` makes an **all-or-nothing** pick — `ingredientsNutrition()` (normalized view; trusted only when `fullyCovered` + servings known) else `recipeNutrition()` (schema fields) — returning `{ values, source: "ingredients" | "recipe" }`. Never re-introduce per-field merging or a parallel resolver: the panel, RecipeDetail's JSON-LD (a **default-state** instance, memoized, so user scaling never leaks into serialization), and MCP `get_recipe` all resolve through `nutrition()`. `normalizedNutrition` props (page → RecipeDetail → CookingModeButton → CookingMode) are constructor transport ONLY. NutritionPanel shows ONE header source badge (logged-in gated), and `formatNutrientDisplay` (format.ts) rounds displayed values > 1 to integers — display-only; JSON-LD/MCP keep full precision. Nutrition values are Schema.org-format `"value unit"` strings by design (the recipe's native wire format); numbers exist only in the per-100g `IngredientNutrition` layer.

**Known follow-up:** normalization status (`recipes.normalization_status` etc., migration 0004) is not yet read into `RECIPE_COLUMNS`/`RecipeRow` or surfaced in RecipeDetail — the planned status chip + "Re-normalize" button. The client wrapper (`normalizeRecipe` in `src/lib/api/recipes.ts`) already exists.

## Test Performance — module loading

Vitest's per-test timeout is 5s. **Don't cold-load a real (unmocked) module graph inside a timed `it`/`it.each` body** — e.g. invoking `import.meta.glob` loaders, or `await import()` of a module that isn't `vi.mock`'d or statically imported at the top of the file. That triggers a cold transform + load of the whole dependency graph inside the timed case, which under full-suite parallel load can exceed 5s and surface as a flaky `Test timed out in 5000ms` (the failure is reported at the `it.each` call site, which makes it look like a different test).

- **Hoist** such loads into `beforeAll` (with a generous hook timeout, e.g. `beforeAll(fn, 30000)`) and keep each test body to invoke + assert.
- The common `await import("@/lib/x")` to read a `vi.mock`'d module is **warm and fine** — the mock factory runs at file eval, so the import returns the cached mock instantly.
- Statically importing the module-under-test at the top of the file is also fine: its graph loads during vitest's *collect* phase, which isn't bound by the per-test timeout.
- Reference: `src/__tests__/route-auth-policy.test.ts` preloads every route handler in `beforeAll`, then each case just invokes the preloaded handler.

## Vitest flake: drive letter in a glob import path (Windows)

**Trigger — if you see this, read [.claude/troubleshooting/vite-glob-drive-letter.md](.claude/troubleshooting/vite-glob-drive-letter.md) BEFORE investigating:** a test file fails to *collect* (whole-file load error, not a test assertion) with `Failed to resolve import "../../../../../c:/…/route.ts"` — a **relative path (`../`) with an embedded drive letter** — most often intermittently from the husky **pre-push** hook, while the same suite passes when run directly. The failing run's vitest banner shows a lowercase `c:/…` root; passing runs show uppercase `C:/…`.

One-line cause: an absolute-root `import.meta.glob("/src/…")` makes Vite relativize two paths (`importerDir` vs root-crawled `matchedFile`) that can disagree on drive-letter **case** on Windows (git-bash lowercases cwd for the hook). Durable fix is a **relative** glob (`../…`) so both operands share the importer origin. It's **known-flaky and usually clears on a re-push** — don't treat a single red pre-push with this exact signature as your change breaking. Full diagnosis, the fix pattern, a verify one-liner, and the weaker root-pin alternative are in the linked doc.