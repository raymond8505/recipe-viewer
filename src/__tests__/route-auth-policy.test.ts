import { describe, it, expect, vi, beforeAll } from "vitest";
import { ROUTE_POLICY, isProtectedPolicy } from "@/lib/api/routePolicy";

// The hard, deterministic auth gate.
//
// 1. COVERAGE: every `src/app/api/**/route.ts` must have an entry in
//    routePolicy.ts (and vice-versa). A new route can't ship unclassified.
// 2. BEHAVIORAL: every route classified as *protected* is invoked with no
//    credentials and must reject (401/403). Execution-based, so a route that is
//    classified protected but forgets to actually run a guard fails here — an
//    import alone can't satisfy it.
//
// Forcing "logged out" makes session-based guards take their reject path.
vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE: "auth_session",
  getIsLoggedIn: vi.fn().mockResolvedValue(false),
  getExpectedToken: () => "unused-in-test",
}));

// Lazy loaders for every route file. The glob is written RELATIVE to this test
// file (`../app/...`) on purpose. An absolute-root glob (`/src/app/...`) makes Vite
// build each dynamic-import specifier as `posix.relative(importerDir, matchedFile)`,
// where the two operands come from different origins: `importerDir` from the module
// graph, `matchedFile` from crawling the project root. On Windows those origins can
// disagree on drive-letter CASE — husky runs the pre-push hook through git-bash,
// which lowercases cwd to `c:`, while the module graph keeps the on-disk `C:`. And
// `posix.relative` across a case-mismatched drive emits a broken specifier like
// `../../../../../c:/.../route.ts` that fails to resolve, so the whole file fails to
// collect (intermittently, only from the hook). A relative glob resolves both
// operands from this file's own id, so their case always matches — no drive letter
// can ever leak into the specifier.
const routeModules = import.meta.glob("../app/api/**/route.ts");

function fileKeyToRoutePath(key: string): string {
  // Keys are importer-relative posix paths ("../app/api/.../route.ts"). Anchor on
  // "/api/" so route derivation is independent of the glob's base form.
  return key.slice(key.indexOf("/api/")).replace(/\/route\.ts$/, "");
}

// route path ("/api/...") -> lazy module loader. Reused for both the coverage gate
// and the behavioral loader lookup, so neither depends on the raw key format.
const routeLoaderByPath = new Map(
  Object.entries(routeModules).map(([key, loader]) => [fileKeyToRoutePath(key), loader]),
);
const discoveredRoutes = [...routeLoaderByPath.keys()].sort();
const registeredRoutes = Object.keys(ROUTE_POLICY).sort();
const protectedPaths = Object.entries(ROUTE_POLICY)
  .filter(([, entry]) => isProtectedPolicy(entry.policy))
  .map(([path]) => path);

describe("route auth policy registry", () => {
  it("classifies every API route file, with no stale entries (coverage gate)", () => {
    // If this fails: a route.ts was added or removed without updating
    // src/lib/api/routePolicy.ts. Add an entry with an explicit policy +
    // rationale, or delete the stale one.
    expect(discoveredRoutes).toEqual(registeredRoutes);
  });

  it("requires a non-empty rationale for every entry", () => {
    for (const [path, entry] of Object.entries(ROUTE_POLICY)) {
      expect(entry.rationale.trim(), `${path} is missing a rationale`).not.toBe("");
    }
  });

  it("has at least one protected route to exercise", () => {
    expect(protectedPaths.length).toBeGreaterThan(0);
  });
});

type RouteHandler = (req: Request, ctx?: unknown) => Promise<Response>;

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

describe("protected routes reject unauthenticated requests (behavioral gate)", () => {
  // Load every protected route's handlers ONCE, up front. Importing a route
  // module is a cold dynamic import that pulls a sizeable graph (e.g. mcp/server,
  // or upload-image → storage → node:net); doing it inside each timed `it` case
  // occasionally blew the 5s per-test timeout under full-suite parallel load.
  // Hoisting it into beforeAll (one-time, with its own generous timeout) keeps
  // each case to a fast invoke + assert.
  //
  // EVERY exported HTTP method is exercised, not just POST — a GET-only or
  // PATCH/DELETE route is as much a part of the protected surface as a POST
  // one. A protected route exporting no recognizable method at all is a
  // classification error and fails loudly here.
  const handlersByPath = new Map<string, Map<HttpMethod, RouteHandler>>();

  beforeAll(async () => {
    await Promise.all(
      protectedPaths.map(async (routePath) => {
        const loader = routeLoaderByPath.get(routePath);
        if (typeof loader !== "function") {
          throw new Error(`no module loader for ${routePath}`);
        }
        const mod = (await loader()) as Record<string, unknown>;
        const handlers = new Map<HttpMethod, RouteHandler>();
        for (const method of HTTP_METHODS) {
          if (typeof mod[method] === "function") {
            handlers.set(method, mod[method] as RouteHandler);
          }
        }
        if (handlers.size === 0) {
          throw new Error(`${routePath} exports no HTTP method handlers`);
        }
        handlersByPath.set(routePath, handlers);
      }),
    );
  }, 30000);

  it.each(protectedPaths)(
    "%s with no credentials → 401/403 on every exported method",
    async (routePath) => {
      const handlers = handlersByPath.get(routePath);
      expect(handlers, `${routePath} handlers were not preloaded`).toBeDefined();

      const url = `http://localhost${routePath.replace("[id]", "test-id")}`;
      const ctx = routePath.includes("[id]")
        ? { params: Promise.resolve({ id: "test-id" }) }
        : undefined;

      // 405 is accepted alongside 401/403: some routes export spec-required
      // stub methods that unconditionally answer Method Not Allowed (e.g. the
      // MCP Streamable-HTTP transport's GET/DELETE). A method that refuses to
      // exist performs no work for anyone — anonymous callers included.
      for (const [method, handler] of handlers!) {
        const res = await handler(new Request(url, { method }), ctx);
        expect(
          [401, 403, 405],
          `${method} ${routePath} must reject unauthenticated requests`,
        ).toContain(res.status);
      }
    },
  );
});
