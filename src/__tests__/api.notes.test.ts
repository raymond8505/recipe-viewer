import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/recipes/[id]/notes/route";
import { RecipeRepoError } from "@/lib/recipes";
import { makeJsonRequest } from "@/fixtures/request";

vi.mock("@/lib/recipes", async (orig) => {
  const actual = await orig<typeof import("@/lib/recipes")>();
  return { ...actual, updateRecipeRow: vi.fn() };
});

// Authorized by default; the dedicated 401 test overrides this per-call.
vi.mock("@/lib/apiAuth", () => ({
  requireApiAuth: vi.fn().mockResolvedValue(null),
}));

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/recipes/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the request is unauthorized", async () => {
    const { requireApiAuth } = await import("@/lib/apiAuth");
    vi.mocked(requireApiAuth).mockResolvedValueOnce(new Response(null, { status: 401 }));

    const res = await POST(makeJsonRequest({ cookingNotes: "more garlic" }), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when the recipe does not exist", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");
    vi.mocked(updateRecipeRow).mockRejectedValueOnce(new RecipeRepoError("not_found", "nope"));

    const res = await POST(makeJsonRequest({ cookingNotes: "more garlic" }), makeParams());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it("returns 500 when the write fails", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");
    vi.mocked(updateRecipeRow).mockRejectedValueOnce(new RecipeRepoError("update_failed", "RLS violation"));

    const res = await POST(makeJsonRequest({ cookingNotes: "more garlic" }), makeParams());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/failed to save/i);
  });

  it("returns 200 with ok:true on success", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");
    vi.mocked(updateRecipeRow).mockResolvedValueOnce({} as never);

    const res = await POST(makeJsonRequest({ cookingNotes: "reduce heat earlier" }), makeParams());
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("patches cookingNotes onto the recipe schema", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");
    vi.mocked(updateRecipeRow).mockResolvedValueOnce({} as never);

    await POST(makeJsonRequest({ cookingNotes: "reduce heat earlier" }), makeParams());
    expect(updateRecipeRow).toHaveBeenCalledWith("recipe-1", {
      schema: { cookingNotes: "reduce heat earlier" },
    });
  });

  it("clears cookingNotes (undefined) when an empty string is sent", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");
    vi.mocked(updateRecipeRow).mockResolvedValueOnce({} as never);

    await POST(makeJsonRequest({ cookingNotes: "" }), makeParams());
    expect(updateRecipeRow).toHaveBeenCalledWith("recipe-1", {
      schema: { cookingNotes: undefined },
    });
  });
});
