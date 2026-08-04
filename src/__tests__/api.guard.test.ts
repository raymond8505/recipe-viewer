import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  requireSession,
  requireSessionOrDev,
  requireSessionOrRecipeTokenOrDev,
} from "@/lib/api/guard";
import { getIsLoggedIn } from "@/lib/auth";
import { requireApiAuth } from "@/lib/apiAuth";

// Unit-level truth table for the guards in src/lib/api/guard.ts, with the
// development open door (src/lib/devAccess.ts) as the axis under test.
//
// The route-level gate in route-auth-policy.test.ts proves the wiring; this
// proves the primitives, including the two properties that keep the bypass
// contained: it is OFF in production, and it never widens the recipe-EDIT
// surface (requireApiAuth is still consulted whenever the door is shut).

vi.mock("@/lib/auth", () => ({
  getIsLoggedIn: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/apiAuth", () => ({
  requireApiAuth: vi.fn().mockResolvedValue(null),
}));

const mockGetIsLoggedIn = vi.mocked(getIsLoggedIn);
const mockRequireApiAuth = vi.mocked(requireApiAuth);

const OK = "handler ran";
const handler = vi.fn(async () => new Response(OK, { status: 200 }));
const ctx = { params: Promise.resolve({ id: "r-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  handler.mockResolvedValue(new Response(OK, { status: 200 }));
  mockGetIsLoggedIn.mockResolvedValue(false);
  mockRequireApiAuth.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function req() {
  return new Request("http://localhost/api/anything");
}

describe("requireSession — unchanged by the dev door", () => {
  it("rejects an anonymous caller even in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await requireSession(handler)(req());
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler for a logged-in caller", async () => {
    mockGetIsLoggedIn.mockResolvedValue(true);
    const res = await requireSession(handler)(req());
    expect(res.status).toBe(200);
  });
});

describe("requireSessionOrDev", () => {
  it("rejects an anonymous caller in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await requireSessionOrDev(handler)(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects an anonymous caller under test — keeps the auth gate meaningful", async () => {
    expect(process.env.NODE_ENV).toBe("test");
    const res = await requireSessionOrDev(handler)(req());
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects an anonymous caller when NODE_ENV is unset — fails closed", async () => {
    vi.stubEnv("NODE_ENV", undefined);
    const res = await requireSessionOrDev(handler)(req());
    expect(res.status).toBe(401);
  });

  it("runs the handler for an anonymous caller in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await requireSessionOrDev(handler)(req());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(OK);
  });

  it("does not even check the session in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await requireSessionOrDev(handler)(req());
    expect(mockGetIsLoggedIn).not.toHaveBeenCalled();
  });

  it("runs the handler for a logged-in caller in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockGetIsLoggedIn.mockResolvedValue(true);
    const res = await requireSessionOrDev(handler)(req());
    expect(res.status).toBe(200);
  });

  it("forwards the request and extra args to the handler", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = req();
    await requireSessionOrDev(handler)(request, "extra");
    expect(handler).toHaveBeenCalledWith(request, "extra");
  });
});

describe("requireSessionOrRecipeTokenOrDev", () => {
  it("delegates to requireApiAuth in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await requireSessionOrRecipeTokenOrDev(handler)(req(), ctx);
    expect(mockRequireApiAuth).toHaveBeenCalledWith(expect.any(Request), "r-1");
  });

  it("rejects with requireApiAuth's response when it denies", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockRequireApiAuth.mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    const res = await requireSessionOrRecipeTokenOrDev(handler)(req(), ctx);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects under test", async () => {
    mockRequireApiAuth.mockResolvedValue(new Response(null, { status: 401 }));
    const res = await requireSessionOrRecipeTokenOrDev(handler)(req(), ctx);
    expect(res.status).toBe(401);
  });

  it("runs the handler for an anonymous caller in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockRequireApiAuth.mockResolvedValue(new Response(null, { status: 401 }));
    const res = await requireSessionOrRecipeTokenOrDev(handler)(req(), ctx);
    expect(res.status).toBe(200);
  });

  it("never consults requireApiAuth in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await requireSessionOrRecipeTokenOrDev(handler)(req(), ctx);
    expect(mockRequireApiAuth).not.toHaveBeenCalled();
  });

  it("runs the handler when requireApiAuth allows (token path) in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await requireSessionOrRecipeTokenOrDev(handler)(req(), ctx);
    expect(res.status).toBe(200);
  });
});
