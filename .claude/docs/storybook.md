# Storybook

Sample data a story renders — never inline it → [fixtures.md](fixtures.md).

## Story Discipline

**Storybook = visual documentation. vitest = behavioral assertions.** The line: if removing a `play()` block makes the story _less visually informative_, keep it. If it only makes it less tested, delete it.

- Never use `play()` to assert that a mock callback was called — that's a vitest test
- Never mock `global.fetch` in a story to simulate API responses — that's a vitest test
- `play()` is appropriate for demonstrating visual state transitions (e.g. NutritionPanel's portion stepper)

**Controlled-component play() trap:** If a component's visual state is fully driven by props/args (e.g. TimerCard, MealTabs), clicking in `play()` fires a callback but won't change what you see — the arg doesn't update. These play() blocks are always tests. Only keep `play()` when the component has *internal* state the interaction mutates (modal opening, confirm overlay, edit input revealing).

**`useSearchParams` in `@storybook/nextjs-vite`:** Pass `parameters.nextjs.navigation.searchParams: { q: "..." }` — the adapter wraps it in `ReadonlyURLSearchParams` internally, so `.get("q")` returns the expected value. No `play()` workaround needed.

## Story Sizing

**Never wrap a story in a `<div>` whose only job is a width** (PR #63 review). Pin the canvas
instead — `globals: { viewport: { value: "panel" } }`, on the meta when every story shares a width,
on the story to override it. The named canvases live in `.storybook/preview.tsx`: `control` (288),
`card` (320), `column` (360, the cooking column), `phone` (390), `sheet` (420), `panel` (480),
`editor` (640), `page` (760). Use a literal — `"576px-400px"` — only when the exact number is the
point, i.e. it's demonstrating a breakpoint or container-query threshold rather than a surface.

**A pinned width needs `layout: "fullscreen"`.** Under `layout: "centered"` the story root is an
auto-margin flex item and shrink-wraps its content, so the canvas width never reaches the component
and the viewport silently does nothing. `padded` costs you 32px. The `AppChrome` preview decorator
deliberately adds no padding, so under `fullscreen` the rendered width *is* the number in the story.

**Intrinsically sized components can't be canvas-sized at all** — a `Button` is `inline-flex`, so
leave those on `centered` with no viewport (`PrimaryActionButton` is the worked example: only its
`FullWidth` story, which passes `w-full`, takes over the canvas).

**`parameters.viewport.defaultViewport` is the v7/v8 API and is a silent no-op in Storybook 10.**
The current spelling is `globals.viewport`; `parameters.viewport.options` only registers the named
set. Supplying `options` *replaces* the built-in viewports rather than merging, and an unrecognised
key silently falls back to the first registered one rather than erroring.

Pinning narrow canvases makes `sm:`/`md:` variants stop matching — previously they always did,
because every story rendered full-width. That is the honest render; don't "fix" it by widening.

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
