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
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));

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

    it("lists 8 tools", async () => {
      const res = await POST(
        rpc({ jsonrpc: "2.0", id: 2, method: JsonRpcMethod.TOOLS_LIST }, { authorization: auth }),
      );
      const body = await res.json();
      const names = body.result.tools.map((t: { name: string }) => t.name).sort();
      expect(names).toEqual(
        [
          "clear_cooking_notes",
          "create_recipe",
          "delete_recipe",
          "get_recipe",
          "get_token",
          "search_recipes",
          "update_recipe",
          "upload_recipe_image",
        ],
      );
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
