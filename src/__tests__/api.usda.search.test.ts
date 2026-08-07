import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/usda/search/route";
import { UsdaError, searchFoodsMixed } from "@/lib/usda";
import { getIsLoggedIn } from "@/lib/auth";

vi.mock("@/lib/usda", async (orig) => {
  const actual = await orig<typeof import("@/lib/usda")>();
  return { ...actual, searchFoodsMixed: vi.fn() };
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
    vi.mocked(searchFoodsMixed).mockResolvedValue([]);
  });

  it("returns the interleaved analytical + branded results", async () => {
    const foods = [
      { fdcId: 1, description: "Chickpeas, canned", dataType: "SR Legacy", score: 260 },
      { fdcId: 2, description: "CHICKPEAS", dataType: "Branded", score: 1181 },
    ];
    vi.mocked(searchFoodsMixed).mockResolvedValue(foods);

    const res = await GET(makeRequest("?q=chickpeas"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: foods });
    expect(searchFoodsMixed).toHaveBeenCalledWith("chickpeas", { pageSize: 10 });
  });

  it("rejects a missing query with 400", async () => {
    const res = await GET(makeRequest(""));

    expect(res.status).toBe(400);
    expect(searchFoodsMixed).not.toHaveBeenCalled();
  });

  it("maps UsdaError to 502", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(searchFoodsMixed).mockRejectedValueOnce(new UsdaError(500, "down"));

    const res = await GET(makeRequest("?q=chickpeas"));

    expect(res.status).toBe(502);
    // The client message is generic; the real upstream status must be logged.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("UsdaError (status 500)"),
    );
    errorSpy.mockRestore();
  });
});
