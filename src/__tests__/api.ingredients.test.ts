import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/ingredients/route";
import {
  IngredientRepoError,
  createIngredientRow,
  getIngredients,
} from "@/lib/ingredients";
import { generateEmbedding } from "@/lib/embedding";
import { getIsLoggedIn } from "@/lib/auth";
import { makeIngredient } from "@/fixtures";
import { makeJsonRequest } from "@/fixtures/request";

vi.mock("@/lib/ingredients", async (orig) => {
  const actual = await orig<typeof import("@/lib/ingredients")>();
  return { ...actual, getIngredients: vi.fn(), createIngredientRow: vi.fn() };
});

vi.mock("@/lib/embedding", () => ({ generateEmbedding: vi.fn() }));

// Logged in by default; the 401 test overrides per-call. (requireSession reads
// getIsLoggedIn — the anonymous rejection itself is asserted by the
// route-auth-policy gate.)
vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE: "auth_session",
  getIsLoggedIn: vi.fn().mockResolvedValue(true),
  getExpectedToken: () => "unused-in-test",
}));

describe("GET /api/ingredients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);
    vi.mocked(getIngredients).mockResolvedValue({ data: [], count: 0 });
  });

  it("returns 401 for anonymous callers", async () => {
    vi.mocked(getIsLoggedIn).mockResolvedValueOnce(false);

    const res = await GET(new Request("http://localhost/api/ingredients"));

    expect(res.status).toBe(401);
    expect(getIngredients).not.toHaveBeenCalled();
  });

  it("passes q/page/limit through to the repo and returns its result", async () => {
    const row = makeIngredient("ing-1", "cumin seed");
    vi.mocked(getIngredients).mockResolvedValueOnce({ data: [row], count: 1 });

    const res = await GET(
      new Request("http://localhost/api/ingredients?q=cumin&page=2&limit=10"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [row], count: 1 });
    expect(getIngredients).toHaveBeenCalledWith({ query: "cumin", page: 2, limit: 10 });
  });

  it("defaults page and limit when absent", async () => {
    await GET(new Request("http://localhost/api/ingredients"));

    expect(getIngredients).toHaveBeenCalledWith({ query: undefined, page: 1, limit: 50 });
  });

  it("rejects invalid pagination with 400", async () => {
    const res = await GET(new Request("http://localhost/api/ingredients?limit=0"));

    expect(res.status).toBe(400);
    expect(getIngredients).not.toHaveBeenCalled();
  });
});

describe("POST /api/ingredients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);
    vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2]);
    vi.mocked(createIngredientRow).mockResolvedValue(
      makeIngredient("ing-1", "kosher salt", { source: "manual" }),
    );
  });

  it("creates with a name-derived embedding and manual source default", async () => {
    const res = await POST(makeJsonRequest({ name: "kosher salt" }));

    expect(res.status).toBe(201);
    expect(generateEmbedding).toHaveBeenCalledWith("kosher salt");
    expect(createIngredientRow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "kosher salt",
        source: "manual",
        embedding: [0.1, 0.2],
      }),
    );
  });

  it("rejects an invalid body with 400", async () => {
    const res = await POST(makeJsonRequest({ name: "" }));

    expect(res.status).toBe(400);
    expect(createIngredientRow).not.toHaveBeenCalled();
  });

  it("returns 503 without creating when embedding generation fails", async () => {
    // The embedding column is NOT NULL, so a null embedding can't be inserted.
    vi.mocked(generateEmbedding).mockResolvedValueOnce(null);

    const res = await POST(makeJsonRequest({ name: "kosher salt" }));

    expect(res.status).toBe(503);
    expect(createIngredientRow).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(
      makeJsonRequest(undefined, { body: "not json{{" }),
    );

    expect(res.status).toBe(400);
  });

  it("maps a name conflict to 409", async () => {
    vi.mocked(createIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("conflict", "exists"),
    );

    const res = await POST(makeJsonRequest({ name: "kosher salt" }));

    expect(res.status).toBe(409);
  });

  it("maps other repo failures to 500", async () => {
    vi.mocked(createIngredientRow).mockRejectedValueOnce(
      new IngredientRepoError("insert_failed", "boom"),
    );

    const res = await POST(makeJsonRequest({ name: "kosher salt" }));

    expect(res.status).toBe(500);
  });
});
