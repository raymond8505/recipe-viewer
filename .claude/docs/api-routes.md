# API Routes — Auth, Handlers, and Calling Them from the UI

## Auth gate

Every route under `src/app/api/**` is classified in `src/lib/api/routePolicy.ts` — the single source of truth for its exposure level. `src/__tests__/route-auth-policy.test.ts` is a **build-breaking gate**: it fails if a route file has no registry entry (or an entry has no file), and it invokes every *protected* route unauthenticated and asserts 401/403. A new route can't ship without an explicit auth decision. Enforce auth with the wrappers in `src/lib/api/guard.ts` — `requireSession` (browser session), `requireSessionOrRecipeToken` (session OR recipe-scoped capability token, the agent path), or their `*OrDev` variants (see the dev-only nutrition door below); don't hand-roll inline checks. Anonymous routes are an explicit allowlist (`public-read` / `oauth-public` / `public-auth`), each with a written rationale. `GET /api/recipes` is `public-read` — anonymous browse/search backs the public UI including cook mode; the `x-requested-by` header is **not** the security boundary (visibility is filtered server-side by `getRecipes`).

**The dev-only nutrition door.** The whole nutrition layer is reachable **without a login when `NODE_ENV === "development"`** so the local loop needs no session: the `/ingredients` catalog manager and its nav link, `/recipes/[id]/ingredients`, the NutritionPanel source badge + breakdown link, and nine API routes (the eight under `/api/ingredients*` + `/api/recipes/[id]/ingredients*` + `/api/usda/search`, plus `/api/recipes/[id]/normalize`). Recipe **edit** controls, cooking notes, and the `requireApiAuth` routes behind them (`/update`, `/notes`, `/upload-image`, `/archive`, `/rescrape`, `/regenerate-image`) are **not** part of this and stay login-gated.

- `src/lib/devAccess.ts` is the only place that reads `NODE_ENV` for this: `isDevEnvironment()` / `canCurateNutrition(isLoggedIn)`. **Read `process.env.NODE_ENV` inside the function body, never at module scope** — call-time reads are what let `vi.stubEnv` drive the containment tests and what let a production `next build` inline the literal and dead-code-eliminate the branch.
- **Never import `devAccess` from a client component.** `storybook dev` runs with `NODE_ENV=development`, so a client-side read would silently flip every story into curation mode. Server components resolve it and thread it down as the `canCurateNutrition` prop, which defaults to `isLoggedIn` (`canCurateNutrition = isLoggedIn` in the destructure) so the safe direction is the default and "curation ⊇ login" stays structural. Keep it distinct from `isLoggedIn` — the same components still gate editing on that.
- Routes use the `session-or-dev` / `session-or-recipe-token-or-dev` policies with the `requireSessionOrDev` / `requireSessionOrRecipeTokenOrDev` guards. The bypass lives in those guards and **not** in `requireApiAuth`, which would have opened the whole edit surface. Both policies are still *protected*, so the existing behavioral gate exercises them unchanged.
- Two extra gates in `route-auth-policy.test.ts` keep it contained, because the behavioral gate runs under `NODE_ENV="test"` and therefore only ever proves "not-development": a **containment gate** stubs `NODE_ENV=production` and re-asserts all nine reject, and a **declaration gate** asserts the set of route files using a `*OrDev` guard equals the set registered with a dev-bypass policy (both directions). `src/__tests__/devAccess.test.ts` is the `vi.stubEnv` canary — if it ever fails, switch devAccess.ts to bracket access (`process.env["NODE_ENV"]`) to defeat static replacement.
- **No env var, deliberately.** The Dockerfile and both compose files pin `NODE_ENV=production`, so the door is structurally unreachable in prod *and* in per-PR staging containers, with zero `deploy.yml`/`staging.yml`/`validate-deploy-env.sh` plumbing and no flag anyone can mistakenly set in prod.

## Consuming API / webhook responses in the UI

When a handler calls a state setter with data from `fetch` or a webhook response:

1. **Never trust TypeScript type assertions on `res.json()`** — they are erased at runtime and do not validate shape. `as { schema: SchemaRecipe }` is a cast, not a parse.
2. **Guard before the state setter**: check that the expected key is present (e.g. `if (!result.schema) throw new Error()`) so a malformed 200 response falls into the existing error state rather than setting state to `undefined`.
3. **A state setter that receives `undefined` will not throw at the call site** — the crash happens on the next render when code accesses a property on the undefined value. Always validate at the boundary.

## Image upload / storage

**`src/lib/imageTypes.ts` is the client-safe image config module.** `IMAGE_CONTENT_TYPES` (config object) is the single source for allowed types + extensions; the allowlist, union type, and `extensionForContentType` are all derived from it. `src/lib/storage.ts` re-exports them but **client components must import from `@/lib/imageTypes`** — storage.ts pulls in `node:net` and breaks the client bundle.

**`MAX_IMAGE_BYTES` is an env var** (`src/env.ts`, zod default `DEFAULT_MAX_IMAGE_BYTES` = 4MB from imageTypes.ts). Server code reads `env.MAX_IMAGE_BYTES`. Client components get it as a `maxImageBytes` prop from the server page (`recipes/[id]/page.tsx`) — **never import `@/env` in a client component**; t3-env throws on server-var access in the browser.

**Route handler params use Next 16's generated global `RouteContext<'/api/recipes/[id]/...'>`** — no import needed; types come from `.next/types` (in tsconfig include). Don't hand-write `{ params: Promise<{ id: string }> }`.
