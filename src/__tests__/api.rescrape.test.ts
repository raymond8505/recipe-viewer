import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseClient as makeClient } from "@/fixtures/supabase";
import type { MakeSupabaseClientOptions } from "@/fixtures/supabase";
import { POST } from "@/app/api/recipes/[id]/rescrape/route";
import { rescrapeFixture } from "@/fixtures/rescrape";

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: { RESCRAPE_WEBHOOK_URL: "https://webhook.test/scrape" },
}));

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

const storedRecipe = {
  id: "recipe-1",
  url: "https://example.com/recipe",
  metadata: { schema: { name: "Old Recipe" } },
};

const makeSupabaseClient = (overrides: MakeSupabaseClientOptions = {}) =>
  makeClient({ recipe: storedRecipe, ...overrides });

function makeWebhookResponse(ok: boolean, body: object = { schema: rescrapeFixture }) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("POST /api/recipes/[id]/rescrape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when recipe is not found", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ recipe: null, fetchError: { message: "Not found" } }) as never
    );

    const res = await POST(new Request("http://localhost/", { method: "POST" }), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 502 when webhook call fails", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    const res = await POST(new Request("http://localhost/", { method: "POST" }), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 502 when webhook is unreachable", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const res = await POST(new Request("http://localhost/", { method: "POST" }), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 502 when webhook response has no schema key", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true, { name: "Missing wrapper" })));

    const res = await POST(new Request("http://localhost/", { method: "POST" }), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 200 with updated schema on success", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true)));

    const res = await POST(new Request("http://localhost/", { method: "POST" }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schema.name).toBe(rescrapeFixture.name);
  });

  it("posts the recipe URL to the webhook", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    const mockFetch = vi.fn(() => makeWebhookResponse(true));
    vi.stubGlobal("fetch", mockFetch);

    await POST(new Request("http://localhost/", { method: "POST" }), makeParams());

    expect(mockFetch).toHaveBeenCalledWith(
      "https://webhook.test/scrape",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/recipe" }),
      })
    );
  });
});
