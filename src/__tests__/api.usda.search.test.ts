import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/usda/search/route";
import { UsdaError, searchFoods } from "@/lib/usda";
import { getIsLoggedIn } from "@/lib/auth";

vi.mock("@/lib/usda", async (orig) => {
  const actual = await orig<typeof import("@/lib/usda")>();
  return { ...actual, searchFoods: vi.fn() };
});

vi.mock("@/env", () => ({
  env: { USDA_API_KEY: "test-usda-key" },
}));

vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE: "auth_session",
  getIsLoggedIn: vi.fn().mockResolvedValue(true),
  getExpectedToken: () => "unused-in-test",
}));

function makeRequest(query: string) {
  return new Request(`http://localhost/api/usda/search${query}`);
}

describe("GET /api/usda/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);
    vi.mocked(searchFoods).mockResolvedValue([]);
  });

  it("searches with Branded included — the human-curated path", async () => {
    const foods = [
      { fdcId: 123, description: "GOCHUJANG PASTE", dataType: "Branded", score: 500 },
    ];
    vi.mocked(searchFoods).mockResolvedValue(foods);

    const res = await GET(makeRequest("?q=gochujang"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: foods });
    expect(searchFoods).toHaveBeenCalledWith("gochujang", {
      includeBranded: true,
      pageSize: 8,
    });
  });

  it("rejects a missing query with 400", async () => {
    const res = await GET(makeRequest(""));

    expect(res.status).toBe(400);
    expect(searchFoods).not.toHaveBeenCalled();
  });

  it("maps UsdaError to 502", async () => {
    vi.mocked(searchFoods).mockRejectedValueOnce(new UsdaError(500, "down"));

    const res = await GET(makeRequest("?q=gochujang"));

    expect(res.status).toBe(502);
  });
});
