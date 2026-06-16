// Shared request builders for route-handler tests.
//
// Direct-import only (like `src/fixtures/supabase.ts`): test infra must not be
// re-exported from the `@/fixtures` barrel, which Storybook loads. Import as
// `import { makeJsonRequest } from "@/fixtures/request"`.

/**
 * Build a POST `Request` with a JSON body and `Content-Type: application/json`.
 * `init` is merged last, so callers can override method/headers/url when needed.
 */
export function makeJsonRequest(body: unknown = {}, init?: RequestInit): Request {
  return new Request("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });
}
