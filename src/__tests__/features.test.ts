import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("features", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables both flags when NODE_ENV is not development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { features } = await import("@/lib/features");
    expect(features.filterByOwnSource).toBe(true);
    expect(features.filterByStatus).toBe(true);
  });

  it("disables both flags when NODE_ENV is development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { features } = await import("@/lib/features");
    expect(features.filterByOwnSource).toBe(false);
    expect(features.filterByStatus).toBe(false);
  });

  it("enables both flags in test environment (not development)", async () => {
    // vitest sets NODE_ENV to "test" by default — flags should be active
    const { features } = await import("@/lib/features");
    expect(features.filterByOwnSource).toBe(true);
    expect(features.filterByStatus).toBe(true);
  });
});
