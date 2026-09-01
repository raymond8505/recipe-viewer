import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/ingredients/search/route";
import { IngredientRepoError, searchIngredientsKeyword } from "@/lib/ingredients";
import { getIsLoggedIn } from "@/lib/auth";

vi.mock("@/lib/ingredients", async (orig) => {
  const actual = await orig<typeof import("@/lib/ingredients")>();
  return { ...actual, searchIngredientsKeyword: vi.fn() };
});

vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE: "auth_session",
  getIsLoggedIn: vi.fn().mockResolvedValue(true),
  getExpectedToken: () => "unused-in-test",
}));

function makeRequest(query: string) {
  return new Request(`http://localhost/api/ingredients/search${query}`);
}

describe("GET /api/ingredients/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);
    vi.mocked(searchIngredientsKeyword).mockResolvedValue([]);
  });

  it("passes q and limit through to the repo search", async () => {
    const matches = [
      {
        id: "ing-1",
        name: "cumin seed",
        aliases: ["cumin"],
        nutrition: null,
        density_g_per_ml: null,
        similarity: 0.87,
      },
    ];
    vi.mocked(searchIngredientsKeyword).mockResolvedValue(matches);

    const res = await GET(makeRequest("?q=cumin&limit=3"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: matches });
    expect(searchIngredientsKeyword).toHaveBeenCalledWith("cumin", 3);
  });

  it("defaults limit to 8", async () => {
    await GET(makeRequest("?q=cumin"));

    expect(searchIngredientsKeyword).toHaveBeenCalledWith("cumin", 8);
  });

  it("rejects a missing query with 400", async () => {
    const res = await GET(makeRequest(""));

    expect(res.status).toBe(400);
    expect(searchIngredientsKeyword).not.toHaveBeenCalled();
  });

  it("rejects an oversized limit with 400", async () => {
    const res = await GET(makeRequest("?q=cumin&limit=50"));

    expect(res.status).toBe(400);
    expect(searchIngredientsKeyword).not.toHaveBeenCalled();
  });

  it("maps match_failed to 500 — never an empty result list", async () => {
    vi.mocked(searchIngredientsKeyword).mockRejectedValueOnce(
      new IngredientRepoError("match_failed", "rpc broke"),
    );

    const res = await GET(makeRequest("?q=cumin"));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Ingredient search unavailable" });
  });
});
