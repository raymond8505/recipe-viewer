import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/recipes/[id]/regenerate-image/route";
import { makeIngredientLines, makeRecipe } from "@/fixtures";

vi.mock("@/lib/recipes", async (orig) => {
  const actual = await orig<typeof import("@/lib/recipes")>();
  return { ...actual, getRecipeById: vi.fn() };
});

// Authorized by default; the dedicated 401 test overrides this per-call.
vi.mock("@/lib/apiAuth", () => ({
  requireApiAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/env", () => ({
  env: { REGEN_IMAGE_WEBHOOK_URL: "https://webhook.test/regen" },
}));

const storedRecipe = makeRecipe("recipe-1", "Old Recipe");

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

function postReq() {
  return new Request("http://localhost/", { method: "POST" });
}

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

describe("POST /api/recipes/[id]/regenerate-image", () => {
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

  it("returns 502 when the webhook returns a non-ok status", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(storedRecipe);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(false)));

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 502 when the webhook response has no image", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(storedRecipe);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true, {})));

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 200 with the image URL on success", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(storedRecipe);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true)));

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(200);
    expect((await res.json()).image).toBe("https://cdn.example.com/regen.png");
  });

  // The webhook is an external consumer: it gets the Schema.org form, with
  // the lines flattened from the groups and the times from the columns — a
  // stale copy the blob still carries must not reach it.
  it("sends the webhook the recipe as Schema.org, times and lines from the columns", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(
      makeRecipe("recipe-1", "Old Recipe", {
        prep_time: 900,
        ingredients: makeIngredientLines(["2 cups flour", "1 egg"]),
        metadata: { schema: { name: "Old Recipe", prepTime: "PT5M", notes: "draw it rustic" } },
      }),
    );
    const fetchSpy = vi.fn(() => makeWebhookResponse(true));
    vi.stubGlobal("fetch", fetchSpy);

    await POST(postReq(), makeParams());

    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      schema: {
        name: "Old Recipe",
        notes: "draw it rustic",
        prepTime: "PT15M",
        recipeIngredient: ["2 cups flour", "1 egg"],
      },
    });
  });
});
