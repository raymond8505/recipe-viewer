// Single source of truth for the intended exposure level of EVERY HTTP route
// under `src/app/api/**`.
//
// Paired with `src/__tests__/route-auth-policy.test.ts`, this registry is a
// hard, deterministic gate:
//   1. The test fails the build if a route file exists without an entry here
//      (or an entry exists without a route file).
//   2. The test invokes every route classified as *protected* with no
//      credentials and asserts it rejects (401/403).
// So every anonymous route is an explicit allowlist entry with a written
// rationale, never an omission.
//
// The guards in `./guard.ts` are how routes enforce the `session` /
// `session-or-recipe-token` policies; `mcp-*`, `oauth-public`, and `public-auth`
// routes carry their own protocol-specific checks (documented per entry).

export type RoutePolicy =
  // Browser session required (the `auth_session` cookie). Enforced via
  // `requireSession` from ./guard.ts.
  | "session"
  // Browser session OR a recipe-scoped, single-use capability token whose
  // subject matches the `[id]` (the agent path). Enforced via
  // `requireSessionOrRecipeToken` / `requireApiAuth`.
  | "session-or-recipe-token"
  // As `session`, plus an open door for ANY caller when NODE_ENV is
  // "development" — the nutrition/ingredient curation surface needs no login in
  // the local dev loop. Enforced via `requireSessionOrDev`.
  | "session-or-dev"
  // As `session-or-recipe-token`, plus the same development-only open door.
  // Enforced via `requireSessionOrRecipeTokenOrDev`.
  | "session-or-recipe-token-or-dev"
  // OAuth 2.1 access token (audience "mcp"), verified by the handler.
  | "mcp-oauth"
  // Static `MCP_API_TOKEN` bearer, verified by the handler.
  | "mcp-static"
  // Intentionally anonymous READ. Object visibility is filtered server-side.
  | "public-read"
  // Intentionally anonymous per the OAuth 2.1 / MCP spec; protected by the
  // protocol itself (PKCE, one-time codes) rather than session/token.
  | "oauth-public"
  // The authentication surface itself — necessarily reachable anonymously.
  | "public-auth";

export interface RouteAuthEntry {
  policy: RoutePolicy;
  /** Why this route has this exposure level. Required for every entry. */
  rationale: string;
}

/**
 * Policies that legitimately answer anonymous (unauthenticated) requests. Every
 * route mapped to one of these is part of the *explicit anonymous allowlist* and
 * must carry a rationale. Everything else is "protected" and must reject
 * unauthenticated requests — asserted behaviorally by the enforcement test.
 */
export const ANONYMOUS_POLICIES = [
  "public-read",
  "oauth-public",
  "public-auth",
] as const satisfies readonly RoutePolicy[];

export function isProtectedPolicy(policy: RoutePolicy): boolean {
  return !(ANONYMOUS_POLICIES as readonly RoutePolicy[]).includes(policy);
}

/**
 * Policies carrying the development-only open door (see src/lib/devAccess.ts).
 * These are still *protected* — the door is shut under `NODE_ENV=test`, so the
 * behavioral gate exercises them exactly like any other protected route — but
 * they are enumerated here so the enforcement test can additionally prove they
 * reject under `NODE_ENV=production`, and cross-check that the set of routes
 * using a `*OrDev` guard is exactly the set declared here.
 */
export const DEV_BYPASS_POLICIES = [
  "session-or-dev",
  "session-or-recipe-token-or-dev",
] as const satisfies readonly RoutePolicy[];

export function isDevBypassPolicy(policy: RoutePolicy): boolean {
  return (DEV_BYPASS_POLICIES as readonly RoutePolicy[]).includes(policy);
}

/**
 * Route path (as derived from `src/app/api/<path>/route.ts`) → exposure policy.
 * Keys use the literal `[id]` dynamic segment, matching the file path.
 */
export const ROUTE_POLICY = {
  // ── Public-facing read surface ──────────────────────────────────────────
  "/api/recipes": {
    policy: "public-read",
    rationale:
      "Anonymous recipe browse/search backs the public-facing UI (incl. cook-mode MealSearch). Visibility is filtered server-side: getRecipes returns published-only to anonymous callers, all statuses when logged in.",
  },

  // ── Recipe mutations: session OR recipe-scoped capability token ─────────
  "/api/recipes/[id]/archive": {
    policy: "session-or-recipe-token",
    rationale: "Mutates a recipe (archive); browser session or recipe-scoped token.",
  },
  "/api/recipes/[id]/normalize": {
    policy: "session-or-recipe-token-or-dev",
    rationale:
      "Manually re-runs ingredient normalization for a recipe (recovery after USDA/Gemini outages or threshold tuning); browser session or recipe-scoped token. Also open to any caller under NODE_ENV=development — it backs the Normalize button on the dev-open NutritionDetail screen. Spends Gemini/USDA quota, which is acceptable at localhost volume.",
  },
  "/api/recipes/[id]/notes": {
    policy: "session-or-recipe-token",
    rationale: "Mutates a recipe (cooking notes); browser session or recipe-scoped token.",
  },
  "/api/recipes/[id]/regenerate-image": {
    policy: "session-or-recipe-token",
    rationale: "Triggers a recipe image regeneration webhook; browser session or recipe-scoped token.",
  },
  "/api/recipes/[id]/rescrape": {
    policy: "session-or-recipe-token",
    rationale: "Triggers a recipe re-scrape webhook; browser session or recipe-scoped token.",
  },
  "/api/recipes/[id]/update": {
    policy: "session-or-recipe-token",
    rationale: "Updates/validates a recipe via webhook; browser session or recipe-scoped token.",
  },
  "/api/recipes/[id]/upload-image": {
    policy: "session-or-recipe-token",
    rationale:
      "Multipart image upload; browser session or single-use recipe-scoped token. This is the agent curl path the get_token MCP tool directs to.",
  },

  // ── Ingredient catalog (logged-in manager UI; open in local dev) ────────
  // Every route in this block is `session-or-dev`: the nutrition layer is fully
  // reachable without a login under `next dev` so the local loop is frictionless.
  // The door is structurally shut everywhere else — the Dockerfile and both
  // compose files pin NODE_ENV=production, and vitest runs as "test". See
  // src/lib/devAccess.ts and the containment gate in route-auth-policy.test.ts.
  "/api/ingredients/search": {
    policy: "session-or-dev",
    rationale:
      "Trigram autocomplete backing the NutritionDetail screen; no anonymous or agent-token use case in production (agents get the search_ingredients MCP tool), but open in local dev alongside the screen it serves.",
  },
  "/api/recipes/[id]/ingredients": {
    policy: "session-or-dev",
    rationale:
      "Reads a recipe's normalized ingredient rows + catalog joins for the NutritionDetail screen; normalized-layer curation is a manager surface, not part of the public recipe view — except in local dev, where that screen is open.",
  },
  "/api/recipes/[id]/ingredients/[riId]": {
    policy: "session-or-dev",
    rationale:
      "Manually re-associates one parsed line to a catalog ingredient (match_status → manual); a curation surface, open in local dev. Recipe-scoped tokens don't apply — agents curate via MCP tools, not this UI path.",
  },
  "/api/recipes/[id]/ingredients/[riId]/grams": {
    policy: "session-or-dev",
    rationale:
      "Sets a parsed line's per-line gram estimate (LLM Estimate button / user-typed value) on the NutritionDetail screen; internal nutrition-manager curation, same surface and same dev-open posture as the sibling association route.",
  },
  "/api/ingredients": {
    policy: "session-or-dev",
    rationale:
      "Ingredient catalog list/create backs the /ingredients manager UI, which is open in local dev; no anonymous or agent-token use case in production (agents get the search_ingredients MCP tool).",
  },
  "/api/ingredients/import-usda": {
    policy: "session-or-dev",
    rationale:
      "Mints a catalog ingredient from a user-picked USDA food (NutritionDetail manual import); catalog writes follow the same dev-open posture as the rest of /api/ingredients.",
  },
  "/api/usda/search": {
    policy: "session-or-dev",
    rationale:
      "Proxies USDA FoodData Central search for the manual-import flow — keeps USDA_API_KEY server-side and the rate-limited upstream (1,000 req/hr) off the PUBLIC surface. The dev door only ever exposes it to localhost, so the quota stays protected from the internet.",
  },
  "/api/ingredients/[id]": {
    policy: "session-or-dev",
    rationale:
      "Ingredient catalog update/delete backs the /ingredients manager UI, open in local dev. Recipe-scoped tokens don't apply — they authorize one recipe, not the shared catalog.",
  },

  // ── MCP transport ───────────────────────────────────────────────────────
  "/api/mcp/server": {
    policy: "mcp-oauth",
    rationale: "MCP JSON-RPC server; requires an OAuth 2.1 access token (audience \"mcp\"), verified per request.",
  },
  "/api/mcp": {
    policy: "mcp-static",
    rationale: "Browser-tool manifest endpoint; requires the static MCP_API_TOKEN bearer.",
  },

  // ── OAuth endpoints ─────────────────────────────────────────────────────
  "/api/oauth/authorize": {
    policy: "session",
    rationale: "OAuth consent; only a logged-in resource owner may grant an authorization code.",
  },
  "/api/oauth/token": {
    policy: "oauth-public",
    rationale: "OAuth token endpoint; anonymous by spec, protected by one-time authorization code + PKCE (RFC 7636).",
  },
  "/api/oauth/register": {
    policy: "oauth-public",
    rationale:
      "OAuth dynamic client registration (RFC 7591); anonymous by spec. Redirect URIs are restricted to HTTPS/loopback. NOTE: unbounded — rate-limiting is tracked in the prevention backlog.",
  },

  // ── Auth surface ────────────────────────────────────────────────────────
  "/api/auth/login": {
    policy: "public-auth",
    rationale: "Password login that establishes the session; necessarily reachable anonymously.",
  },
  "/api/auth/logout": {
    policy: "public-auth",
    rationale: "Clears the session cookie; idempotent and safe to call anonymously.",
  },
} satisfies Record<string, RouteAuthEntry>;

export type KnownRoutePath = keyof typeof ROUTE_POLICY;
