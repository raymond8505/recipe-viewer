// Browser-safe constants for the OAuth flow. Split out from `./oauth` so that
// browser bundles (Storybook stories for OAuth UI, future client-side OAuth
// helpers) can reference these values without pulling in Node's `crypto`
// module via the rest of oauth.ts.
//
// The actual signing / verification / PKCE-check helpers stay in `./oauth`
// and are only safe to import from server-side code (route handlers, server
// components).

// TTLs are stored in milliseconds (the native JS unit). Convert to seconds at
// the boundaries that need it: jose's `setExpirationTime` accepts a duration
// string like "3600s", and the OAuth `expires_in` response field is in seconds.
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const REFRESH_TOKEN_TTL_MS = 60 * 60 * 24 * 30 * 1000; // 30 days
export const AUTH_CODE_TTL_MS = 60 * 10 * 1000; // 10 minutes

export const JWT_AUDIENCE = "mcp";
export const DEFAULT_SCOPE = "mcp";

// OAuth 2.1 `response_type` values we accept. We only support the
// authorization-code flow; `token` (implicit) was removed in OAuth 2.1.
export const ResponseType = {
  CODE: "code",
} as const;
export type ResponseType = (typeof ResponseType)[keyof typeof ResponseType];

// PKCE code challenge methods (RFC 7636). `plain` is allowed by the spec but
// strongly discouraged; we only accept `S256`.
export const CodeChallengeMethod = {
  S256: "S256",
} as const;
export type CodeChallengeMethod =
  (typeof CodeChallengeMethod)[keyof typeof CodeChallengeMethod];
