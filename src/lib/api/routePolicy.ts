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
    policy: "session-or-recipe-token",
    rationale:
      "Manually re-runs ingredient normalization for a recipe (recovery after USDA/Gemini outages or threshold tuning); browser session or recipe-scoped token.",
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
