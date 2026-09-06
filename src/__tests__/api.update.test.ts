import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/recipes/[id]/update/route";
import { RecipeRepoError } from "@/lib/recipes";
import { makeRecipe } from "@/fixtures";
import { makeJsonRequest } from "@/fixtures/request";
import { composeRecipeSchema } from "@/lib/recipeSchema";
import type { SchemaRecipe } from "@/types/recipe";

vi.mock("@/lib/recipes", async (orig) => {
  const actual = await orig<typeof import("@/lib/recipes")>();
  return { ...actual, getRecipeById: vi.fn(), updateRecipeRow: vi.fn() };
});

// Authorized by default; the dedicated 401 test overrides this per-call.
vi.mock("@/lib/apiAuth", () => ({
  requireApiAuth: vi.fn().mockResolvedValue(null),
}));

const storedRecipe = makeRecipe("recipe-1", "Old Recipe", {
  url: "https://example.com/recipe",
});

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/recipes/[id]/update", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getRecipeById, updateRecipeRow } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValue(storedRecipe);
    // Build the saved row the way the repo does — lines into rows + groups,
    // the rest into metadata.schema — so the route's echo is tested against a
    // real RecipeRow rather than a blob that happens to still carry the lines.
    vi.mocked(updateRecipeRow).mockImplementation(async (_id, patch) => {
      const schema = { ...storedRecipe.metadata.schema, ...patch.schema } as SchemaRecipe;
      return makeRecipe("recipe-1", schema.name, {
        schema,
        url: patch.url ?? storedRecipe.url,
        source: patch.source ?? storedRecipe.source,
        status: patch.status ?? storedRecipe.status,
      });
    });
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

  it("returns 404 when the repo reports the recipe missing", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");
    vi.mocked(updateRecipeRow).mockRejectedValueOnce(new RecipeRepoError("not_found", "gone"));

    const res = await POST(makeJsonRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 500 when the repo update fails", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");
    vi.mocked(updateRecipeRow).mockRejectedValueOnce(new RecipeRepoError("update_failed", "RLS violation"));

    const res = await POST(makeJsonRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(500);
  });

  it("returns 200 with the persisted schema and status on success", async () => {
    const res = await POST(makeJsonRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schema.name).toBe("Test");
    expect(body.status).toBe("draft");
  });

  // The client adopts the echoed schema as its live state, so it must be the
  // whole composed recipe. Since db/migrations/0016 `metadata.schema` holds no
  // lines or steps — or, on a backfilled row, a FROZEN pre-migration copy — and
  // echoing it rendered the page without its ingredients until a reload.
  it("echoes the composed schema, not the stored metadata blob", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");
    const saved = makeRecipe("recipe-1", "Test", {
      schema: {
        recipeIngredient: ["2 cups flour", "1 tsp salt"],
        recipeInstructions: [{ "@type": "HowToStep", text: "Mix." }],
      },
    });
    const frozen = {
      ...saved.metadata.schema,
      recipeIngredient: ["1 egg"],
      recipeInstructions: [],
    } as SchemaRecipe;
    vi.mocked(updateRecipeRow).mockResolvedValueOnce({
      ...saved,
      metadata: { schema: frozen },
    });

    const res = await POST(
      makeJsonRequest({ schema: { name: "Test" }, status: "draft" }),
      makeParams(),
    );

    const body = await res.json();
    const composed = composeRecipeSchema({ ...saved, metadata: { schema: frozen } });
    expect(body.schema.recipeIngredient).toEqual(composed.recipeIngredient);
    expect(body.schema.recipeInstructions).toEqual(composed.recipeInstructions);
    // Every echoed line names its recipe_ingredients row, so the next save
    // round-trips the ids instead of minting fresh rows.
    expect(body.schema.recipeIngredient.map((l: { id: string }) => l.id)).toEqual(
      saved.ingredientRows.map((row) => row.id),
    );
    expect(body.schema.recipeIngredient).not.toEqual(["1 egg"]);
  });

  it("does not call any external webhook (persists directly)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await POST(makeJsonRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("persists the stored recipe.url when no url is in the request body", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");

    await POST(makeJsonRequest({ schema: { name: "Test" }, status: "draft" }), makeParams());

    expect(updateRecipeRow).toHaveBeenCalledWith("recipe-1", {
      url: "https://example.com/recipe",
      source: storedRecipe.source,
      schema: { name: "Test" },
      status: "draft",
    });
  });

  it("persists body.url when provided, overriding the stored url", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");

    await POST(
      makeJsonRequest({ schema: { name: "Test" }, status: "draft", url: "https://corrected.com/recipe" }),
      makeParams(),
    );

    expect(updateRecipeRow).toHaveBeenCalledWith("recipe-1", {
      url: "https://corrected.com/recipe",
      source: storedRecipe.source,
      schema: { name: "Test" },
      status: "draft",
    });
  });

  // `source` is editable from the recipe editor like url and status. It is not
  // a free-form label: isOwnRecipe reads it to decide whether Re-scrape applies.
  it("persists body.source when provided, overriding the stored source", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");

    await POST(
      makeJsonRequest({ schema: { name: "Test" }, status: "draft", source: "custom" }),
      makeParams(),
    );

    expect(updateRecipeRow).toHaveBeenCalledWith(
      "recipe-1",
      expect.objectContaining({ source: "custom" }),
    );
  });

  // The editor re-seeds its draft from this echo on the next open. Without it
  // the client falls back to its server-rendered `recipe` prop, which a
  // client-side save never updates — a saved URL edit would appear to revert.
  it("echoes the persisted url so the client can re-render without a refetch", async () => {
    const res = await POST(
      makeJsonRequest({
        schema: { name: "Test" },
        status: "draft",
        url: "https://corrected.com/recipe",
      }),
      makeParams(),
    );

    expect(await res.json()).toMatchObject({
      url: "https://corrected.com/recipe",
    });
  });

  it("echoes the persisted source so the client can re-render without a refetch", async () => {
    const res = await POST(
      makeJsonRequest({ schema: { name: "Test" }, status: "draft", source: "custom" }),
      makeParams(),
    );

    expect(await res.json()).toMatchObject({ source: "custom" });
  });

  // isOwnRecipe reads casing leniently, but the column also feeds the ?source=
  // browse filter and MCP search_recipes, which match exactly — so the stored
  // own-recipe value is folded to the lowercase literal on the way in.
  it("stores the own-recipe source in canonical lowercase", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");

    await POST(
      makeJsonRequest({ schema: { name: "Test" }, status: "draft", source: "Custom" }),
      makeParams(),
    );

    expect(updateRecipeRow).toHaveBeenCalledWith(
      "recipe-1",
      expect.objectContaining({ source: "custom" }),
    );
  });

  it("leaves a non-custom source's casing alone", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");

    await POST(
      makeJsonRequest({
        schema: { name: "Test" },
        status: "draft",
        source: "An Edible Mosaic",
      }),
      makeParams(),
    );

    expect(updateRecipeRow).toHaveBeenCalledWith(
      "recipe-1",
      expect.objectContaining({ source: "An Edible Mosaic" }),
    );
  });

  // Blank degrades to "no change" rather than clearing the column: an empty
  // string is never a meaningful provenance, and both isOwnRecipe and the
  // browse filter read it. Mirrors the editor's invalid-servings handling —
  // it must never block the save.
  it.each([["", "empty"], ["   ", "whitespace"]])(
    "keeps the stored source when body.source is %s (%s)",
    async (source) => {
      const { updateRecipeRow } = await import("@/lib/recipes");

      const res = await POST(
        makeJsonRequest({ schema: { name: "Test" }, status: "draft", source }),
        makeParams(),
      );

      expect(res.status).toBe(200);
      expect(updateRecipeRow).toHaveBeenCalledWith(
        "recipe-1",
        expect.objectContaining({ source: storedRecipe.source }),
      );
    },
  );
});
