// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ getIsLoggedIn: vi.fn() }));
vi.mock("@/lib/mcp/recipeToken", () => ({
  verifyRecipeToken: vi.fn(),
  consumeRecipeToken: vi.fn(),
}));

import { consumeRequestToken, requireApiAuth } from "@/lib/apiAuth";
import { getIsLoggedIn } from "@/lib/auth";
import { consumeRecipeToken, verifyRecipeToken } from "@/lib/mcp/recipeToken";

const RECIPE_ID = "recipe-1";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/recipes/${RECIPE_ID}/update`, {
    method: "POST",
    headers,
  });
}

describe("requireApiAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authorizes a logged-in browser session without checking the token", async () => {
    vi.mocked(getIsLoggedIn).mockResolvedValue(true);

    expect(await requireApiAuth(makeRequest(), RECIPE_ID)).toBeNull();
    expect(verifyRecipeToken).not.toHaveBeenCalled();
  });

  it("authorizes a recipe-scoped token matching the route id", async () => {
    vi.mocked(getIsLoggedIn).mockResolvedValue(false);
    vi.mocked(verifyRecipeToken).mockResolvedValue(true);

    expect(
      await requireApiAuth(makeRequest({ authorization: "Bearer good" }), RECIPE_ID),
    ).toBeNull();
    expect(verifyRecipeToken).toHaveBeenCalledWith("good", RECIPE_ID);
  });

  it("returns 401 when neither a session nor a token is present", async () => {
    vi.mocked(getIsLoggedIn).mockResolvedValue(false);

    const res = await requireApiAuth(makeRequest(), RECIPE_ID);
    expect(res?.status).toBe(401);
  });

  it("returns 401 when the token is not valid for this recipe", async () => {
    vi.mocked(getIsLoggedIn).mockResolvedValue(false);
    vi.mocked(verifyRecipeToken).mockResolvedValue(false);

    const res = await requireApiAuth(
      makeRequest({ authorization: "Bearer wrong-recipe" }),
      RECIPE_ID,
    );
    expect(res?.status).toBe(401);
  });

  it("ignores a non-Bearer Authorization header and returns 401", async () => {
    vi.mocked(getIsLoggedIn).mockResolvedValue(false);

    const res = await requireApiAuth(
      makeRequest({ authorization: "Basic abc123" }),
      RECIPE_ID,
    );
    expect(res?.status).toBe(401);
    expect(verifyRecipeToken).not.toHaveBeenCalled();
  });
});

describe("consumeRequestToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("spends the bearer token when one is present", async () => {
    await consumeRequestToken(makeRequest({ authorization: "Bearer tok" }));
    expect(consumeRecipeToken).toHaveBeenCalledWith("tok");
  });

  it("is a no-op for the cookie path (no bearer token)", async () => {
    await consumeRequestToken(makeRequest());
    expect(consumeRecipeToken).not.toHaveBeenCalled();
  });
});
