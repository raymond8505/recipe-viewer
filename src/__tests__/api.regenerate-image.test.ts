import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseClient as makeClient } from "@/fixtures/supabase";
import type { MakeSupabaseClientOptions } from "@/fixtures/supabase";
import { POST } from "@/app/api/recipes/[id]/regenerate-image/route";

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

// Authorized by default; the dedicated 401 test overrides this per-call.
vi.mock("@/lib/apiAuth", () => ({
  requireApiAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/env", () => ({
  env: { REGEN_IMAGE_WEBHOOK_URL: "https://webhook.test/regen" },
}));

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

const storedRecipe = {
  id: "recipe-1",
  metadata: { schema: { name: "Old Recipe" } },
};

const makeSupabaseClient = (overrides: MakeSupabaseClientOptions = {}) =>
  makeClient({ recipe: storedRecipe, ...overrides });

function makeWebhookResponse(
  ok: boolean,
  body: object = { image: "https://cdn.example.com/regen.png" },
) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function makeRequest() {
  return new Request("http://localhost/", { method: "POST" });
}

describe("POST /api/recipes/[id]/regenerate-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the request is unauthorized", async () => {
    const { requireApiAuth } = await import("@/lib/apiAuth");
    vi.mocked(requireApiAuth).mockResolvedValueOnce(
      new Response(null, { status: 401 }),
    );

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when recipe is not found", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ recipe: null, fetchError: { message: "Not found" } }) as never,
    );

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 502 when the webhook returns a non-ok status", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(false)));

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 502 when the webhook response has no image", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true, {})));

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 200 with the image URL on success", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true)));

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.image).toBe("https://cdn.example.com/regen.png");
  });
});
