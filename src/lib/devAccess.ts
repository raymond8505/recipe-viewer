// The dev-only open door for the nutrition layer.
//
// Every nutrition surface — the NutritionPanel source badge and breakdown link,
// /recipes/[id]/ingredients, the /ingredients catalog manager, and the API
// routes behind them — is login-gated in production but freely reachable when
// running `next dev`, so the local loop needs no session.
//
// WHY THIS IS SAFE
// `NODE_ENV` is pinned to "production" in every built image (Dockerfile
// `ENV NODE_ENV=production`; docker-compose.yml and docker-compose.staging.yml
// both set it explicitly), so the door is structurally unreachable in prod AND
// in per-PR staging containers. Vitest defaults it to "test", so it is inert
// under test too — which is what keeps the route-auth-policy behavioral gate
// meaningful.
//
// TWO RULES, BOTH LOAD-BEARING
//  1. Read `process.env.NODE_ENV` INSIDE the function, never at module scope.
//     Call-time reads are what let `vi.stubEnv` drive the containment tests, and
//     what lets a production `next build` inline the literal and dead-code-
//     eliminate the whole branch.
//  2. NEVER import this from a client component. `storybook dev` runs with
//     NODE_ENV=development, so a client-side read would silently flip every
//     story into curation mode. Server components resolve the value and thread
//     it down as the `canCurateNutrition` prop.
//
// Enforcement lives in src/__tests__/devAccess.test.ts (the vi.stubEnv canary)
// and the containment + declaration gates in
// src/__tests__/route-auth-policy.test.ts.

/** True only under `next dev` / `vitest --mode development`-style local runs. */
export function isDevEnvironment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Whether the caller may see and curate the nutrition layer: a logged-in
 * session, or any caller at all in local development.
 *
 * Deliberately takes `isLoggedIn` as an argument rather than reading the cookie
 * itself — that keeps this module free of `next/headers` and makes the
 * "curation ⊇ login" invariant visible at every call site.
 */
export function canCurateNutrition(isLoggedIn: boolean): boolean {
  return isLoggedIn || isDevEnvironment();
}
