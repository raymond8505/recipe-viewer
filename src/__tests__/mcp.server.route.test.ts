// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { recipeFixtures } from "@/fixtures";

vi.mock("@/env", () => ({
  env: {
    OAUTH_JWT_SECRET: "test-secret-must-be-at-least-32-characters-long!",
    MCP_PUBLIC_URL: "http://localhost:3000",
    MAX_IMAGE_BYTES: 4_000_000,
  },
}));

vi.mock("@/lib/recipes", () => ({
  getRecipes: vi.fn(),
  getRecipeById: vi.fn(),
  createRecipeRow: vi.fn(),
  updateRecipeRow: vi.fn(),
  archiveRecipe: vi.fn(),
  RecipeRepoError: class RecipeRepoError extends Error {
    constructor(public kind: string, public detail: string) {
      super(`${kind}: ${detail}`);
      this.name = "RecipeRepoError";
    }
  },
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
  // ingredients.ts builds INGREDIENT_COLUMNS at module load via selectColumns;
  // mirror the real join so importing the tool graph doesn't throw here.
  selectColumns: () => (cols: readonly string[]) => cols.join(", "),
}));

import { POST, GET, DELETE } from "@/app/api/mcp/server/route";
import { signAccessToken } from "@/lib/mcp/oauth";
import { JsonRpcErrorCode, JsonRpcMethod } from "@/lib/mcp/types";

function rpc(body: object, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/mcp/server", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("/api/mcp/server", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 + WWW-Authenticate when no bearer token", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", id: 1, method: JsonRpcMethod.TOOLS_LIST }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/Bearer resource_metadata=/);
  });

  it("returns 401 for a malformed token", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 1, method: JsonRpcMethod.TOOLS_LIST }, { authorization: "Bearer not-a-jwt" }),
    );
    expect(res.status).toBe(401);
  });

  it("GET and DELETE return 405", async () => {
    expect((await GET()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
  });

  describe("with a valid token", () => {
    let auth: string;
    beforeEach(async () => {
      const token = await signAccessToken({ clientId: "client_test", scope: "mcp" });
      auth = `Bearer ${token}`;
    });

    it("returns server info on initialize", async () => {
      const res = await POST(
        rpc({ jsonrpc: "2.0", id: 1, method: JsonRpcMethod.INITIALIZE }, { authorization: auth }),
      );
      const body = await res.json();
      expect(body.result.protocolVersion).toBeTruthy();
      expect(body.result.serverInfo.name).toBe("recipe-viewer-mcp");
    });

    it("lists 13 tools", async () => {
      const res = await POST(
        rpc({ jsonrpc: "2.0", id: 2, method: JsonRpcMethod.TOOLS_LIST }, { authorization: auth }),
      );
      const body = await res.json();
      const names = body.result.tools.map((t: { name: string }) => t.name).sort();
      expect(names).toEqual(
        [
          "clear_cooking_notes",
          "create_ingredient",
          "create_recipe",
          "delete_ingredient",
          "delete_recipe",
          "get_ingredient",
          "get_recipe",
          "get_token",
          "search_ingredients",
          "search_recipes",
          "update_ingredient",
          "update_recipe",
          "upload_recipe_image",
        ],
      );
    });

    // The descriptions are the agent's whole instruction surface, and two
    // claims in them are load-bearing enough to regress badly if reworded.
    it("tells the agent to judge on semantic_similarity, not the RRF score", async () => {
      const res = await POST(
        rpc({ jsonrpc: "2.0", id: 3, method: JsonRpcMethod.TOOLS_LIST }, { authorization: auth }),
      );
      const body = await res.json();
      const search = body.result.tools.find(
        (t: { name: string }) => t.name === "search_ingredients",
      );

      // match_ingredients fuses by RRF (rrf_k=50, weights 1/1), so a perfect
      // match scores ~0.04. An agent told "similarity, 1.0 = identical" reads
      // that as a 4% match and creates a duplicate row instead.
      expect(search.description).toContain("semantic_similarity");
      expect(search.description).toContain("RANKING ONLY");
      expect(search.description).not.toContain("1.0 = identical");

      // SIM_AUTO_ACCEPT/SIM_NOVEL_FLOOR are self-described guesses set before
      // catalog names became USDA descriptions, which lowered recipe-phrase
      // similarity across the board. Quoting them as cutoffs would bias the
      // agent toward "no match" — i.e. toward minting duplicate rows.
      expect(search.description).not.toMatch(/0\.85|0\.6\b/);
    });

    it("points create_ingredient at aliasing an existing row before creating", async () => {
      const res = await POST(
        rpc({ jsonrpc: "2.0", id: 4, method: JsonRpcMethod.TOOLS_LIST }, { authorization: auth }),
      );
      const body = await res.json();
      const tools: Array<{ name: string; description: string }> = body.result.tools;
      const create = tools.find((t) => t.name === "create_ingredient")!;
      const update = tools.find((t) => t.name === "update_ingredient")!;

      // Recipe wording lives in aliases now, so the common correct move is to
      // teach an existing row a name — not to mint a near-duplicate.
      expect(create.description).toContain("search_ingredients");
      expect(create.description).toContain("update_ingredient");
      // aliases replaces the array; both tools must say to read it back first.
      expect(create.description).toContain("get_ingredient");
      expect(update.description).toContain("get_ingredient");
    });

    it("executes search_recipes via tools/call", async () => {
      const { getRecipes } = await import("@/lib/recipes");
      vi.mocked(getRecipes).mockResolvedValueOnce({ data: recipeFixtures.slice(0, 1), count: 1 });

      const res = await POST(
        rpc(
          {
            jsonrpc: "2.0",
            id: 3,
            method: JsonRpcMethod.TOOLS_CALL,
            params: { name: "search_recipes", arguments: { query: "tofu" } },
          },
          { authorization: auth },
        ),
      );
      const body = await res.json();
      expect(body.result.content[0].type).toBe("text");
      const parsed = JSON.parse(body.result.content[0].text);
      expect(parsed.count).toBe(1);
    });

    it("formats argument-validation failures with tool name and field paths", async () => {
      // Regression for the food_portions spiral: nutrition without
      // nutrition_portion must fail with a message that names the tool and
      // the missing field — not a raw zod issues array with path [].
      const res = await POST(
        rpc(
          {
            jsonrpc: "2.0",
            id: 7,
            method: JsonRpcMethod.TOOLS_CALL,
            params: {
              name: "create_ingredient",
              arguments: {
                name: "PC Maple Breakfast Pork Sausages",
                nutrition: { calories_kcal: 237.5 },
                food_portions: [{ gramWeight: 80, amount: 3, modifier: "sausages" }],
              },
            },
          },
          { authorization: auth },
        ),
      );
      const body = await res.json();
      expect(body.result.isError).toBe(true);
      const text = body.result.content[0].text as string;
      expect(text).toMatch(/^invalid_arguments: create_ingredient/);
      expect(text).toMatch(/nutrition_portion:/);
      expect(text).toMatch(/food_portions does not satisfy/);
    });

    it("returns isError result when the tool throws", async () => {
      const { getRecipeById } = await import("@/lib/recipes");
      vi.mocked(getRecipeById).mockResolvedValueOnce(null);

      const res = await POST(
        rpc(
          {
            jsonrpc: "2.0",
            id: 4,
            method: JsonRpcMethod.TOOLS_CALL,
            params: { name: "get_recipe", arguments: { id: "missing" } },
          },
          { authorization: auth },
        ),
      );
      const body = await res.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toMatch(/not_found/);
    });

    it("returns JSON-RPC error for unknown method", async () => {
      const res = await POST(
        rpc({ jsonrpc: "2.0", id: 5, method: "garbage" }, { authorization: auth }),
      );
      const body = await res.json();
      expect(body.error.code).toBe(JsonRpcErrorCode.METHOD_NOT_FOUND);
    });

    it("returns 204 No Content for notifications (no id)", async () => {
      const res = await POST(
        rpc(
          { jsonrpc: "2.0", method: JsonRpcMethod.NOTIFICATIONS_INITIALIZED },
          { authorization: auth },
        ),
      );
      expect(res.status).toBe(204);
    });
  });
});
