import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/recipes/[id]/rescrape/route";
import { rescrapeFixture } from "./fixtures/rescrape";

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

function makeSupabaseClient({
  recipe = { id: "recipe-1", url: "https://example.com/recipe", metadata: { schema: { name: "Old Recipe" } } },
  fetchError = null,
  updateError = null,
}: {
  recipe?: object | null;
  fetchError?: object | null;
  updateError?: object | null;
} = {}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: recipe, error: fetchError }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: updateError }),
      })),
    })),
  };
}

function makeWebhookResponse(ok: boolean, body: object = rescrapeFixture) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("POST /api/recipes/[id]/rescrape", () => {
  const { getSupabaseClient } = vi.hoisted(() => ({
    getSupabaseClient: vi.fn(),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 503 when RESCRAPE_WEBHOOK_URL is not set", async () => {
    const res = await POST(new Request("http://localhost/api/recipes/recipe-1/rescrape", { method: "POST" }), makeParams());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
  });

  it("returns 404 when recipe is not found", async () => {
    vi.stubEnv("RESCRAPE_WEBHOOK_URL", "https://webhook.test/scrape");
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ recipe: null, fetchError: { message: "Not found" } }) as never
    );

    const res = await POST(new Request("http://localhost/", { method: "POST" }), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 502 when webhook call fails", async () => {
    vi.stubEnv("RESCRAPE_WEBHOOK_URL", "https://webhook.test/scrape");
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    const res = await POST(new Request("http://localhost/", { method: "POST" }), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 502 when webhook is unreachable", async () => {
    vi.stubEnv("RESCRAPE_WEBHOOK_URL", "https://webhook.test/scrape");
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const res = await POST(new Request("http://localhost/", { method: "POST" }), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 500 when Supabase update fails", async () => {
    vi.stubEnv("RESCRAPE_WEBHOOK_URL", "https://webhook.test/scrape");
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ updateError: { message: "RLS violation" } }) as never
    );
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true)));

    const res = await POST(new Request("http://localhost/", { method: "POST" }), makeParams());
    expect(res.status).toBe(500);
  });

  it("returns 200 with updated schema on success", async () => {
    vi.stubEnv("RESCRAPE_WEBHOOK_URL", "https://webhook.test/scrape");
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true)));

    const res = await POST(new Request("http://localhost/", { method: "POST" }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schema.name).toBe(rescrapeFixture.name);
  });

  it("posts the recipe URL to the webhook", async () => {
    vi.stubEnv("RESCRAPE_WEBHOOK_URL", "https://webhook.test/scrape");
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
