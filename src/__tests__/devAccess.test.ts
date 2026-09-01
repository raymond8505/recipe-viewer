import { describe, it, expect, afterEach, vi } from "vitest";
import { isDevEnvironment, canCurateNutrition } from "@/lib/devAccess";

// This file is the CANARY for the whole dev-bypass feature.
//
// The bypass is safe only because `NODE_ENV` is read at call time: that is what
// makes it stubbable here, and what makes a production `next build` inline the
// literal and drop the branch entirely. If Vite's transform ever started
// statically replacing `process.env.NODE_ENV` in this module, `vi.stubEnv`
// would go inert — every containment assertion downstream (api.guard.test.ts,
// the route-auth-policy containment gate) would keep "passing" while proving
// nothing. These tests fail loudly the moment that happens.
//
// Fix if it ever does: switch devAccess.ts to bracket access
// (`process.env["NODE_ENV"]`), which defeats static replacement.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isDevEnvironment", () => {
  it("is true in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isDevEnvironment()).toBe(true);
  });

  it("is false in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isDevEnvironment()).toBe(false);
  });

  it("is false under test — the default vitest env, which keeps the auth gates honest", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(isDevEnvironment()).toBe(false);
  });

  it("is false when NODE_ENV is unset — fails closed", () => {
    vi.stubEnv("NODE_ENV", undefined);
    expect(isDevEnvironment()).toBe(false);
  });

  it("is false for any other value", () => {
    for (const value of ["staging", "dev", "DEVELOPMENT", ""]) {
      vi.stubEnv("NODE_ENV", value);
      expect(isDevEnvironment(), `NODE_ENV=${JSON.stringify(value)}`).toBe(false);
    }
  });

  it("re-reads NODE_ENV on every call (no module-scope capture)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isDevEnvironment()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(isDevEnvironment()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isDevEnvironment()).toBe(false);
  });
});

describe("canCurateNutrition", () => {
  it("opens for anonymous callers in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(canCurateNutrition(false)).toBe(true);
  });

  it("stays shut for anonymous callers in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(canCurateNutrition(false)).toBe(false);
  });

  it("stays shut for anonymous callers under test", () => {
    expect(canCurateNutrition(false)).toBe(false);
  });

  it("is true for a logged-in caller in every environment (curation ⊇ login)", () => {
    for (const value of ["development", "production", "test", undefined]) {
      vi.stubEnv("NODE_ENV", value);
      expect(canCurateNutrition(true), `NODE_ENV=${value}`).toBe(true);
    }
  });
});
