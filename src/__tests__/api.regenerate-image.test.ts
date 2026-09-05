import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/recipes/[id]/regenerate-image/route";
import { makeRecipe } from "@/fixtures";
import { composeRecipeSchema } from "@/lib/recipeSchema";
import type { SchemaRecipe } from "@/types/recipe";

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

  // The webhook renders the recipe it is handed into the image prompt, so it
  // must get the composed recipe. Since db/migrations/0016 the blob carries no
  // lines — or, on a backfilled row, a frozen pre-migration copy of them.
  it("sends the composed schema to the webhook, not the stored metadata blob", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    const current = makeRecipe("recipe-1", "Backfilled", {
      schema: {
        recipeIngredient: ["2 cups flour", "1 tsp salt"],
        recipeInstructions: [{ "@type": "HowToStep", text: "Mix." }],
      },
    });
    const frozen = {
      ...current.metadata.schema,
      recipeIngredient: ["1 egg"],
      recipeInstructions: [],
    } as SchemaRecipe;
    const backfilled = { ...current, metadata: { schema: frozen } };
    vi.mocked(getRecipeById).mockResolvedValueOnce(backfilled);
    const fetchMock = vi.fn(() => makeWebhookResponse(true));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(200);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(init.body as string).schema;
    expect(sent).toEqual(composeRecipeSchema(backfilled));
    expect(sent.recipeIngredient.map((l: { name: string }) => l.name)).toEqual([
      "2 cups flour",
      "1 tsp salt",
    ]);
  });

  it("returns 200 with the image URL on success", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(storedRecipe);
    vi.stubGlobal("fetch", vi.fn(() => makeWebhookResponse(true)));

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(200);
    expect((await res.json()).image).toBe("https://cdn.example.com/regen.png");
  });
});
