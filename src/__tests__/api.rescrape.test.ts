import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/recipes/[id]/rescrape/route";
import { makeRecipe, rescrapeFixture } from "@/fixtures";

vi.mock("@/lib/recipes", async (orig) => {
  const actual = await orig<typeof import("@/lib/recipes")>();
  return { ...actual, getRecipeById: vi.fn() };
});

// Authorized by default; the dedicated 401 test overrides this per-call.
vi.mock("@/lib/apiAuth", () => ({
  requireApiAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/env", () => ({
  env: { RESCRAPE_WEBHOOK_URL: "https://webhook.test/scrape" },
}));

const storedRecipe = makeRecipe("recipe-1", "Old Recipe", {
  url: "https://example.com/recipe",
});

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

function postReq() {
  return new Request("http://localhost/", { method: "POST" });
}

function makeWebhookResponse(ok: boolean, body: object = { schema: rescrapeFixture }) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("POST /api/recipes/[id]/rescrape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the request is unauthorized", async () => {
    const { requireApiAuth } = await import("@/lib/apiAuth");
    vi.mocked(requireApiAuth).mockResolvedValueOnce(new Response(null, { status: 401 }));

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when recipe is not found", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(null);

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 502 when webhook call fails", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(storedRecipe);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 502 when webhook is unreachable", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(storedRecipe);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 502 when webhook response has no schema key", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(storedRecipe);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true, { name: "Missing wrapper" })));

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 200 with updated schema on success", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(storedRecipe);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true)));

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(200);
    expect((await res.json()).schema.name).toBe(rescrapeFixture.name);
  });

  it("posts the recipe URL to the webhook", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(storedRecipe);
    const mockFetch = vi.fn(() => makeWebhookResponse(true));
    vi.stubGlobal("fetch", mockFetch);

    await POST(postReq(), makeParams());

    expect(mockFetch).toHaveBeenCalledWith(
      "https://webhook.test/scrape",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/recipe" }),
      }),
    );
  });
});
