# Storybook

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

## Nav Structure

- `Components/Cooking Mode/*` — all cooking session components
- `Components/Recipes/*` — recipe display, filters, search, pagination, card, grid
- `Components/Icons` — icon library (stays at root)

New stories must follow this structure. A story landing at root `Components/X` will look wrong in the sidebar.

## Configuration

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
