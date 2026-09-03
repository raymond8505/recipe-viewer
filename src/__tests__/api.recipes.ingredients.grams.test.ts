import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH, POST } from "@/app/api/recipes/[id]/ingredients/[riId]/grams/route";
import {
  IngredientRepoError,
  getRecipeIngredientById,
  setRecipeIngredientGrams,
} from "@/lib/ingredients";
import { estimateLineGrams } from "@/lib/normalization/estimateGrams";
import { getIsLoggedIn } from "@/lib/auth";
import { makeRecipeIngredient } from "@/fixtures";
import { makeJsonRequest } from "@/fixtures/request";

vi.mock("@/lib/ingredients", async (orig) => {
  const actual = await orig<typeof import("@/lib/ingredients")>();
  return {
    ...actual,
    getRecipeIngredientById: vi.fn(),
    setRecipeIngredientGrams: vi.fn(),
  };
});

vi.mock("@/lib/normalization/estimateGrams", () => ({
  estimateLineGrams: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE: "auth_session",
  getIsLoggedIn: vi.fn().mockResolvedValue(true),
  getExpectedToken: () => "unused-in-test",
}));

const makeParams = (id = "r-1", riId = "ri-1") => ({
  params: Promise.resolve({ id, riId }),
});

describe("POST /api/recipes/[id]/ingredients/[riId]/grams (estimate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);
    vi.mocked(getRecipeIngredientById).mockResolvedValue(
      makeRecipeIngredient("r-1", 0, {
        raw_text: "3 tbsp chopped garlic",
        name_text: "chopped garlic",
        quantity: 3,
        unit: "tbsp",
      }),
    );
    vi.mocked(estimateLineGrams).mockResolvedValue(26);
    vi.mocked(setRecipeIngredientGrams).mockResolvedValue(
      makeRecipeIngredient("r-1", 0, { estimated_grams: 26, grams_source: "llm" }),
    );
  });

  it("estimates from the line and stores the result as 'llm'", async () => {
    const res = await POST(new Request("http://localhost"), makeParams());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ estimated_grams: 26, grams_source: "llm" });
    expect(estimateLineGrams).toHaveBeenCalledWith({
      rawText: "3 tbsp chopped garlic",
      name: "chopped garlic",
      quantity: 3,
      unit: "tbsp",
    });
    expect(setRecipeIngredientGrams).toHaveBeenCalledWith("r-1", "ri-1", 26, "llm");
  });

  it("404s when the line doesn't exist under the recipe", async () => {
    vi.mocked(getRecipeIngredientById).mockResolvedValue(null);

    const res = await POST(new Request("http://localhost"), makeParams());

    expect(res.status).toBe(404);
    expect(estimateLineGrams).not.toHaveBeenCalled();
  });

  it("422s when the model can't estimate", async () => {
    vi.mocked(estimateLineGrams).mockResolvedValue(null);

    const res = await POST(new Request("http://localhost"), makeParams());

    expect(res.status).toBe(422);
    expect(setRecipeIngredientGrams).not.toHaveBeenCalled();
  });

  it("maps a repo not_found to 404", async () => {
    vi.mocked(setRecipeIngredientGrams).mockRejectedValueOnce(
      new IngredientRepoError("not_found", "gone"),
    );

    const res = await POST(new Request("http://localhost"), makeParams());

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/recipes/[id]/ingredients/[riId]/grams (manual set/clear)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);
    vi.mocked(setRecipeIngredientGrams).mockResolvedValue(
      makeRecipeIngredient("r-1", 0, { estimated_grams: 42, grams_source: "manual" }),
    );
  });

  it("sets a user-typed value as 'manual'", async () => {
    const res = await PATCH(
      makeJsonRequest({ grams: 42 }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(setRecipeIngredientGrams).toHaveBeenCalledWith("r-1", "ri-1", 42, "manual");
  });

  it("clears with null (source null)", async () => {
    vi.mocked(setRecipeIngredientGrams).mockResolvedValue(
      makeRecipeIngredient("r-1", 0, { estimated_grams: null, grams_source: null }),
    );

    const res = await PATCH(
      makeJsonRequest({ grams: null }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(setRecipeIngredientGrams).toHaveBeenCalledWith("r-1", "ri-1", null, null);
  });

  // 0 is a value, not a rejection: it's how a curator says "don't count this
  // line" for an ingredient nobody can weigh. It must reach the repo as 0 with
  // source "manual" — NOT collapse to the null/clear path, which would restore
  // the derived value and re-block the recipe's coverage.
  it("stores an explicit 0 as 'manual' rather than treating it as a clear", async () => {
    vi.mocked(setRecipeIngredientGrams).mockResolvedValue(
      makeRecipeIngredient("r-1", 0, { estimated_grams: 0, grams_source: "manual" }),
    );

    const res = await PATCH(
      makeJsonRequest({ grams: 0 }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(setRecipeIngredientGrams).toHaveBeenCalledWith("r-1", "ri-1", 0, "manual");
    expect(await res.json()).toMatchObject({
      estimated_grams: 0,
      grams_source: "manual",
    });
  });

  it("rejects a negative value with 400", async () => {
    const res = await PATCH(
      makeJsonRequest({ grams: -1 }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(400);
    expect(setRecipeIngredientGrams).not.toHaveBeenCalled();
  });

  it("maps a repo not_found to 404", async () => {
    vi.mocked(setRecipeIngredientGrams).mockRejectedValueOnce(
      new IngredientRepoError("not_found", "gone"),
    );

    const res = await PATCH(
      makeJsonRequest({ grams: 42 }, { method: "PATCH" }),
      makeParams(),
    );

    expect(res.status).toBe(404);
  });
});
