import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/recipes/[id]/archive/route";
import { RecipeRepoError } from "@/lib/recipes";

vi.mock("@/lib/recipes", async (orig) => {
  const actual = await orig<typeof import("@/lib/recipes")>();
  return { ...actual, archiveRecipe: vi.fn() };
});

// Authorized by default; the dedicated 401 test overrides this per-call.
vi.mock("@/lib/apiAuth", () => ({
  requireApiAuth: vi.fn().mockResolvedValue(null),
}));

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

function postReq() {
  return new Request("http://localhost/", { method: "POST" });
}

describe("POST /api/recipes/[id]/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the request is unauthorized", async () => {
    const { requireApiAuth } = await import("@/lib/apiAuth");
    vi.mocked(requireApiAuth).mockResolvedValueOnce(new Response(null, { status: 401 }));

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when the recipe does not exist", async () => {
    const { archiveRecipe } = await import("@/lib/recipes");
    vi.mocked(archiveRecipe).mockRejectedValueOnce(new RecipeRepoError("not_found", "nope"));

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it("returns 500 when the archive write fails", async () => {
    const { archiveRecipe } = await import("@/lib/recipes");
    vi.mocked(archiveRecipe).mockRejectedValueOnce(new RecipeRepoError("update_failed", "RLS violation"));

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(500);
  });

  it("returns 200 with ok:true on success", async () => {
    const { archiveRecipe } = await import("@/lib/recipes");
    vi.mocked(archiveRecipe).mockResolvedValueOnce(undefined);

    const res = await POST(postReq(), makeParams());
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("archives the recipe by id", async () => {
    const { archiveRecipe } = await import("@/lib/recipes");
    vi.mocked(archiveRecipe).mockResolvedValueOnce(undefined);

    await POST(postReq(), makeParams());
    expect(archiveRecipe).toHaveBeenCalledWith("recipe-1");
  });
});
