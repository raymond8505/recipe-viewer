import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/recipes/[id]/normalize/route";
import { setRecipeNormalization } from "@/lib/ingredients";
import { scheduleNormalization } from "@/lib/normalization/trigger";
import { makeRecipe } from "@/fixtures";

vi.mock("@/lib/recipes", async (orig) => {
  const actual = await orig<typeof import("@/lib/recipes")>();
  return { ...actual, getRecipeById: vi.fn() };
});

vi.mock("@/lib/ingredients", async (orig) => {
  const actual = await orig<typeof import("@/lib/ingredients")>();
  return { ...actual, setRecipeNormalization: vi.fn() };
});

vi.mock("@/lib/normalization/trigger", () => ({
  scheduleNormalization: vi.fn(),
}));

// Authorized by default; the dedicated 401 test overrides this per-call.
vi.mock("@/lib/apiAuth", () => ({
  requireApiAuth: vi.fn().mockResolvedValue(null),
}));

const storedRecipe = makeRecipe("recipe-1", "Recipe");

function makeRequest() {
  return new Request("http://localhost/api/recipes/recipe-1/normalize", {
    method: "POST",
  });
}

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/recipes/[id]/normalize", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValue(storedRecipe);
    vi.mocked(setRecipeNormalization).mockResolvedValue(undefined);
  });

  it("returns 401 when the request is unauthorized", async () => {
    const { requireApiAuth } = await import("@/lib/apiAuth");
    vi.mocked(requireApiAuth).mockResolvedValueOnce(
      new Response(null, { status: 401 }),
    );

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(401);
    expect(scheduleNormalization).not.toHaveBeenCalled();
  });

  it("returns 404 without scheduling when the recipe does not exist", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(null);

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    expect(setRecipeNormalization).not.toHaveBeenCalled();
    expect(scheduleNormalization).not.toHaveBeenCalled();
  });

  it("marks the recipe pending and schedules the run", async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "queued" });
    expect(setRecipeNormalization).toHaveBeenCalledWith("recipe-1", {
      status: "pending",
      error: null,
    });
    expect(scheduleNormalization).toHaveBeenCalledWith("recipe-1");
  });
});
