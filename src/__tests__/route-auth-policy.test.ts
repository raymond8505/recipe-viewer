import { describe, it, expect, vi } from "vitest";
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

// Lazy loaders for every route file. Keys are project-root-absolute posix paths
// (e.g. "/src/app/api/recipes/[id]/archive/route.ts"), even on Windows.
const routeModules = import.meta.glob("/src/app/api/**/route.ts");

function fileKeyToRoutePath(key: string): string {
  // "/src/app/api/recipes/[id]/archive/route.ts" -> "/api/recipes/[id]/archive"
  return key.replace(/^\/src\/app/, "").replace(/\/route\.ts$/, "");
}

const discoveredRoutes = Object.keys(routeModules).map(fileKeyToRoutePath).sort();
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

describe("protected routes reject unauthenticated requests (behavioral gate)", () => {
  it.each(protectedPaths)(
    "POST %s with no credentials → 401/403",
    async (routePath) => {
      const fileKey = `/src/app${routePath}/route.ts`;
      const loader = routeModules[fileKey];
      expect(loader, `no module loader for ${fileKey}`).toBeTypeOf("function");

      const mod = (await loader()) as Record<string, unknown>;
      const handler = mod.POST as
        | ((req: Request, ctx?: unknown) => Promise<Response>)
        | undefined;
      expect(handler, `${routePath} must export a POST handler`).toBeTypeOf("function");

      const url = `http://localhost${routePath.replace("[id]", "test-id")}`;
      const req = new Request(url, { method: "POST" });
      const ctx = routePath.includes("[id]")
        ? { params: Promise.resolve({ id: "test-id" }) }
        : undefined;

      const res = await handler!(req, ctx);
      expect([401, 403]).toContain(res.status);
    },
  );
});
