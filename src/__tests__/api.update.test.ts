import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/recipes/[id]/update/route";
import { RecipeRepoError } from "@/lib/recipes";
import { makeRecipe, rescrapeFixture } from "@/fixtures";
import { makeJsonRequest } from "@/fixtures/request";

vi.mock("@/lib/recipes", async (orig) => {
  const actual = await orig<typeof import("@/lib/recipes")>();
  return { ...actual, getRecipeById: vi.fn(), updateRecipeRow: vi.fn() };
});

// Authorized by default; the dedicated 401 test overrides this per-call.
vi.mock("@/lib/apiAuth", () => ({
  requireApiAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/env", () => ({
  env: { EDIT_WEBHOOK_URL: "https://webhook.test/edit" },
}));

const storedRecipe = makeRecipe("recipe-1", "Old Recipe", {
  url: "https://example.com/recipe",
});

const webhookResponse = { schema: rescrapeFixture, status: "published" };

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

function makeWebhookResponse(ok: boolean, body: object = webhookResponse) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("POST /api/recipes/[id]/update", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValue(storedRecipe);
  });

  it("returns 401 when the request is unauthorized", async () => {
    const { requireApiAuth } = await import("@/lib/apiAuth");
    vi.mocked(requireApiAuth).mockResolvedValueOnce(new Response(null, { status: 401 }));

    const res = await POST(makeJsonRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when recipe is not found", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(null);

    const res = await POST(makeJsonRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 502 when webhook is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const res = await POST(makeJsonRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 502 when webhook returns non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    const res = await POST(makeJsonRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 500 when the repo update fails", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true)));
    vi.mocked(updateRecipeRow).mockRejectedValueOnce(new RecipeRepoError("update_failed", "RLS violation"));

    const res = await POST(makeJsonRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(500);
  });

  it("returns 200 with updated schema and status on success", async () => {
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true)));

    const res = await POST(makeJsonRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schema.name).toBe(rescrapeFixture.name);
    expect(body.status).toBe("published");
  });

  it("sends stored recipe.url to webhook when no url in request body", async () => {
    const mockFetch = vi.fn(() => makeWebhookResponse(true));
    vi.stubGlobal("fetch", mockFetch);

    await POST(makeJsonRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());

    const sent = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sent.url).toBe("https://example.com/recipe");
    expect(sent.schema.name).toBe("Test");
    expect(sent.status).toBe("draft");
  });

  it("sends body.url to webhook when provided, overriding stored url", async () => {
    const mockFetch = vi.fn(() => makeWebhookResponse(true));
    vi.stubGlobal("fetch", mockFetch);

    await POST(
      makeJsonRequest({ schema: { name: "Test" }, status: "draft", url: "https://corrected.com/recipe" }),
      makeParams(),
    );

    const sent = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sent.url).toBe("https://corrected.com/recipe");
  });

  it("persists the effective url, schema, and status via updateRecipeRow", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true)));

    await POST(
      makeJsonRequest({ schema: { name: "Test" }, status: "draft", url: "https://corrected.com/recipe" }),
      makeParams(),
    );

    expect(updateRecipeRow).toHaveBeenCalledWith("recipe-1", {
      url: "https://corrected.com/recipe",
      schema: rescrapeFixture,
      status: "published",
    });
  });
});
