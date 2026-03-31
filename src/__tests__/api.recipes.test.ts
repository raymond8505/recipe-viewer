import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/recipes/route";

vi.mock("@/lib/recipes", () => ({
  getRecipes: vi.fn().mockResolvedValue({ data: [], count: 0 }),
}));

vi.mock("@/lib/auth", () => ({
  getIsLoggedIn: vi.fn().mockResolvedValue(false),
}));

function makeRequest(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

describe("GET /api/recipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when X-Requested-By header is missing", async () => {
    const res = await GET(makeRequest("http://localhost:3000/api/recipes"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when X-Requested-By header is wrong", async () => {
    const res = await GET(
      makeRequest("http://localhost:3000/api/recipes", {
        "x-requested-by": "other",
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with correct X-Requested-By header", async () => {
    const res = await GET(
      makeRequest("http://localhost:3000/api/recipes", {
        "x-requested-by": "recipe-viewer",
      })
    );
    expect(res.status).toBe(200);
  });

  it("returns JSON result when authorized", async () => {
    const { getRecipes } = await import("@/lib/recipes");
    vi.mocked(getRecipes).mockResolvedValueOnce({
      data: [{ id: "1", url: "http://example.com", source: "test", metadata: { schema: { name: "Pasta" } } }] as never,
      count: 1,
    });

    const res = await GET(
      makeRequest("http://localhost:3000/api/recipes?q=pasta", {
        "x-requested-by": "recipe-viewer",
      })
    );
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.data[0].metadata.schema.name).toBe("Pasta");
  });

  it("passes isLoggedIn from auth to getRecipes", async () => {
    const { getRecipes } = await import("@/lib/recipes");
    const { getIsLoggedIn } = await import("@/lib/auth");
    vi.mocked(getIsLoggedIn).mockResolvedValueOnce(true);

    await GET(
      makeRequest("http://localhost:3000/api/recipes", {
        "x-requested-by": "recipe-viewer",
      })
    );

    expect(vi.mocked(getRecipes)).toHaveBeenCalledWith(
      expect.objectContaining({ isLoggedIn: true })
    );
  });
});
