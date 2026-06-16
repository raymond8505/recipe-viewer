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
- `Components/HeadsUp/*` — heads-up game components
- `Components/WhatsForDinner/*` — what's for dinner decision tool components
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

## What's for Dinner? Feature

Decision tool at `/whats-for-dinner`. Winner-stays matchup; backend drives contender selection. Code lives in `src/components/whats-for-dinner/`, `src/hooks/useWFD.ts`, `src/types/whats-for-dinner.ts`, `src/app/api/whats-for-dinner/route.ts`.

**Wire format boundary:** The webhook speaks `FlatRecipeRow` (flat `schema` field) in both directions. The hook flattens `state.choices` (RecipeRow[]) before the fetch; the API route promotes the response back to RecipeRow[] before returning. Everything inside the app is RecipeRow. Do not collapse this boundary.

**Response shape:** `{ recipes: FlatRecipeRow[] }` — the API route also tolerates `[{ recipes }]` array wrapping. Validate on `r.schema?.name` (not `r.metadata?.schema?.name`).

**Merge algorithm (CONTENDERS_LOADED reducer):** On initial load (`winnerIndex === null`) place the response directly. After a pick: winner = `state.choices[last]`, `pool = response.filter(r => r.id !== winner.id)`, fill non-winner slots left-to-right from pool. `winnerIndex` is set on PICK and must be cleared after merge.

**Animation:** React key-based remounting — no imperative timers. Each slot wrapper is keyed by `recipe.id`. Key change → remount → `animate-wfd-slide-in` fires on mount. Outgoing card gets `animate-wfd-slide-out` via class change during loading (same id, no remount). `losingIndices` (all indices except winner's) is computed eagerly in the PICK reducer case before the fetch starts.

**Never reuse recipe IDs across contender slots** — the animation won't fire if the key doesn't change.

## Test Performance — module loading

Vitest's per-test timeout is 5s. **Don't cold-load a real (unmocked) module graph inside a timed `it`/`it.each` body** — e.g. invoking `import.meta.glob` loaders, or `await import()` of a module that isn't `vi.mock`'d or statically imported at the top of the file. That triggers a cold transform + load of the whole dependency graph inside the timed case, which under full-suite parallel load can exceed 5s and surface as a flaky `Test timed out in 5000ms` (the failure is reported at the `it.each` call site, which makes it look like a different test).

- **Hoist** such loads into `beforeAll` (with a generous hook timeout, e.g. `beforeAll(fn, 30000)`) and keep each test body to invoke + assert.
- The common `await import("@/lib/x")` to read a `vi.mock`'d module is **warm and fine** — the mock factory runs at file eval, so the import returns the cached mock instantly.
- Statically importing the module-under-test at the top of the file is also fine: its graph loads during vitest's *collect* phase, which isn't bound by the per-test timeout.
- Reference: `src/__tests__/route-auth-policy.test.ts` preloads every route handler in `beforeAll`, then each case just invokes the preloaded handler.