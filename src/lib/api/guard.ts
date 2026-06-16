import { NextResponse } from "next/server";
import { getIsLoggedIn } from "@/lib/auth";
import { requireApiAuth } from "@/lib/apiAuth";

// Higher-order auth guards for App Router route handlers.
//
// These wrappers make the *secure path the default*: a route opts into an
// exposure level by wrapping its handler, and the check runs before the handler
// body — there is no ordering mistake to make and nothing to forget mid-handler.
// Next.js middleware is deliberately NOT used as the boundary: it is bypassable
// (CVE-2025-29927), so every protected handler enforces auth itself.
//
// The companion `routePolicy.ts` registry classifies every route, and
// `src/__tests__/route-auth-policy.test.ts` fails the build if a route is
// unclassified or a route classified as protected does not actually reject an
// unauthenticated request.

type Handler<Args extends unknown[]> = (
  req: Request,
  ...args: Args
) => Response | Promise<Response>;

function unauthorized(): Response {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Run `handler` only for a logged-in browser session (the `auth_session`
 * cookie, via {@link getIsLoggedIn}); otherwise reply 401 before the handler
 * runs. For endpoints that back logged-in-only tools (e.g. the paid LLM webhook
 * proxies).
 */
export function requireSession<Args extends unknown[]>(
  handler: Handler<Args>,
): (req: Request, ...args: Args) => Promise<Response> {
  return async (req, ...args) => {
    if (!(await getIsLoggedIn())) return unauthorized();
    return handler(req, ...args);
  };
}

type RecipeParamsContext = { params: Promise<{ id: string }> };

/**
 * Run a `/api/recipes/[id]/*` handler only for a logged-in session OR a valid
 * recipe-scoped capability token whose subject matches the `[id]` in the path
 * (the agent path — see {@link requireApiAuth}). The recipe id is read from the
 * route context and passed to the existing {@link requireApiAuth} guard, so the
 * token-scoping and single-use semantics are unchanged. Generic over the
 * context type so each route keeps its generated `RouteContext<...>`.
 */
export function requireSessionOrRecipeToken<Ctx extends RecipeParamsContext>(
  handler: (req: Request, ctx: Ctx) => Response | Promise<Response>,
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    const { id } = await ctx.params;
    const denied = await requireApiAuth(req, id);
    if (denied) return denied;
    return handler(req, ctx);
  };
}
