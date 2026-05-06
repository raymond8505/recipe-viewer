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

**`AgentChatWidget` tests are pre-broken** (not related to shopping list). Widget toggle changed from `<button>` to `<div>` without updating tests — 5 tests fail looking for `role="button" name=/agent api/i`.

## Schema.org JSON-LD Sanitization

Custom fields (`notes`, ingredient `group` objects) must never appear in the JSON-LD `<script>` output — external tools only understand the standard Schema.org/Recipe spec.

`toSchemaOrgJsonLd(schema)` in `src/lib/format.ts` is the single gatekeeper: it uses an **explicit allowlist** of standard fields and normalizes `recipeIngredient` objects to plain strings via `getIngredientText`.

**Rules:**
- Any new standard Schema.org/Recipe property added to `SchemaRecipe` must also be added to the `optionalFields` array in `toSchemaOrgJsonLd`, or it won't appear in JSON-LD output
- Any new custom/app-level field on `SchemaRecipe` must be intentionally left out of `toSchemaOrgJsonLd`
- `recipeIngredient` objects (`{ name, group }`) are internal-only — always flatten to strings before external serialization

## Webhook / API Response Handling

When a handler calls a state setter with data from `fetch` or a webhook response:

1. **Never trust TypeScript type assertions on `res.json()`** — they are erased at runtime and do not validate shape. `as { schema: SchemaRecipe }` is a cast, not a parse.
2. **Guard before the state setter**: check that the expected key is present (e.g. `if (!result.schema) throw new Error()`) so a malformed 200 response falls into the existing error state rather than setting state to `undefined`.
3. **A state setter that receives `undefined` will not throw at the call site** — the crash happens on the next render when code accesses a property on the undefined value. Always validate at the boundary.

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

## Deploy Workflow — Env Var Checklist

Whenever a new server-side env var is introduced (webhook URL, API token, feature flag, etc.), the deploy workflow **must** be updated in the same PR. The `appleboy/ssh-action` pattern in `.github/workflows/deploy.yml` requires the var in **three places** — missing any one silently drops it:

1. `env:` block — binds the GitHub Secret to the job
2. `envs:` comma-separated list — passes it through the SSH boundary
3. The `.env` heredoc — writes it to disk on the VPS so Docker Compose picks it up

**Before shipping any feature that reads `process.env.X`:** grep `deploy.yml` for `X` and confirm all three entries exist. If they don't, the var will be absent at runtime and the feature will silently 503.