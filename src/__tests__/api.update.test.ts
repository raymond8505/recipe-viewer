import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseClient as makeClient } from "@/fixtures/supabase";
import type { MakeSupabaseClientOptions } from "@/fixtures/supabase";
import { POST } from "@/app/api/recipes/[id]/update/route";
import { rescrapeFixture } from "@/fixtures/rescrape";

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

// Authorized by default; the dedicated 401 test overrides this per-call.
vi.mock("@/lib/apiAuth", () => ({
  requireApiAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/env", () => ({
  env: { EDIT_WEBHOOK_URL: "https://webhook.test/edit" },
}));

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: object) {
  return new Request("http://localhost/api/recipes/recipe-1/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const storedRecipe = {
  id: "recipe-1",
  url: "https://example.com/recipe",
  metadata: { schema: { name: "Old Recipe" } },
};

const webhookResponse = { schema: rescrapeFixture, status: "published" };

const makeSupabaseClient = (overrides: MakeSupabaseClientOptions = {}) =>
  makeClient({ recipe: storedRecipe, ...overrides });

function makeWebhookResponse(ok: boolean, body: object = webhookResponse) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("POST /api/recipes/[id]/update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the request is unauthorized", async () => {
    const { requireApiAuth } = await import("@/lib/apiAuth");
    vi.mocked(requireApiAuth).mockResolvedValueOnce(
      new Response(null, { status: 401 })
    );

    const res = await POST(makeRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when recipe is not found", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ recipe: null, fetchError: { message: "Not found" } }) as never
    );

    const res = await POST(makeRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 502 when webhook is unreachable", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const res = await POST(makeRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 502 when webhook returns non-ok status", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    const res = await POST(makeRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 500 when Supabase update fails", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ updateError: { message: "RLS violation" } }) as never
    );
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true)));

    const res = await POST(makeRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(500);
  });

  it("returns 200 with updated schema and status on success", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true)));

    const res = await POST(makeRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schema.name).toBe(rescrapeFixture.name);
    expect(body.status).toBe("published");
  });

  it("sends stored recipe.url to webhook when no url in request body", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    const mockFetch = vi.fn(() => makeWebhookResponse(true));
    vi.stubGlobal("fetch", mockFetch);

    await POST(makeRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());

    const call = mockFetch.mock.calls[0];
    const sent = JSON.parse(call[1].body);
    expect(sent.url).toBe("https://example.com/recipe");
    expect(sent.schema.name).toBe("Test");
    expect(sent.status).toBe("draft");
  });

  it("sends body.url to webhook when provided, overriding stored url", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    const mockFetch = vi.fn(() => makeWebhookResponse(true));
    vi.stubGlobal("fetch", mockFetch);

    await POST(
      makeRequest({ schema: { name: "Test" }, status: "draft", url: "https://corrected.com/recipe" }),
      makeParams()
    );

    const call = mockFetch.mock.calls[0];
    const sent = JSON.parse(call[1].body);
    expect(sent.url).toBe("https://corrected.com/recipe");
  });

  it("saves the effective url to Supabase on success", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const client = makeSupabaseClient();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true)));

    await POST(
      makeRequest({ schema: { name: "Test" }, status: "draft", url: "https://corrected.com/recipe" }),
      makeParams()
    );

    // from() is called twice: once for select, once for update — results[1] is the update call
    const updateCall = client.from.mock.results[1].value.update.mock.calls[0][0];
    expect(updateCall.url).toBe("https://corrected.com/recipe");
  });
});
