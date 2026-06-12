// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { recipeFixtures } from "@/fixtures";

vi.mock("@/env", () => ({
  env: { OAUTH_JWT_SECRET: "x".repeat(32), MCP_PUBLIC_URL: "http://localhost:3000" },
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

import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  searchRecipes,
  ToolError,
  updateRecipe,
} from "@/lib/mcp/tools";
import { RecipeRepoError } from "@/lib/recipes";

describe("searchRecipes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates to getRecipes with isLoggedIn=true", async () => {
    const { getRecipes } = await import("@/lib/recipes");
    vi.mocked(getRecipes).mockResolvedValueOnce({ data: recipeFixtures.slice(0, 2), count: 2 });
    const out = await searchRecipes({ query: "tofu" });
    expect(getRecipes).toHaveBeenCalledWith(expect.objectContaining({ query: "tofu", isLoggedIn: true }));
    expect(out.count).toBe(2);
    expect(out.data).toHaveLength(2);
  });
});

describe("getRecipe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the recipe row when found", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(recipeFixtures[0]);
    const out = await getRecipe({ id: recipeFixtures[0].id });
    expect(out.id).toBe(recipeFixtures[0].id);
  });

  it("throws ToolError(not_found) when missing", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(null);
    await expect(getRecipe({ id: "missing" })).rejects.toBeInstanceOf(ToolError);
  });
});

describe("createRecipe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates to createRecipeRow and passes through the row", async () => {
    const { createRecipeRow } = await import("@/lib/recipes");
    const inserted = {
      id: "new-id",
      url: "https://example.com/r",
      source: "example.com",
      status: "draft",
      metadata: { schema: { name: "New" } },
    } as never;
    vi.mocked(createRecipeRow).mockResolvedValueOnce(inserted);

    const out = await createRecipe({
      url: "https://example.com/r",
      source: "example.com",
      schema: { name: "New" },
    });
    expect(out.id).toBe("new-id");
    expect(createRecipeRow).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/r", source: "example.com" }),
    );
  });

  it("translates RecipeRepoError to ToolError(create_failed)", async () => {
    const { createRecipeRow } = await import("@/lib/recipes");
    vi.mocked(createRecipeRow).mockRejectedValueOnce(new RecipeRepoError("insert_failed", "RLS"));
    await expect(
      createRecipe({ url: "https://example.com/r", source: "x", schema: { name: "X" } }),
    ).rejects.toMatchObject({ code: "create_failed" });
  });
});

describe("updateRecipe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates to updateRecipeRow with the patch", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");
    const existing = recipeFixtures[0];
    const updated = {
      ...existing,
      metadata: { schema: { ...existing.metadata.schema, description: "patched" } },
    };
    vi.mocked(updateRecipeRow).mockResolvedValueOnce(updated);

    const out = await updateRecipe({ id: existing.id, schema: { description: "patched" } });
    expect(out.metadata.schema.description).toBe("patched");
    expect(updateRecipeRow).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ schema: { description: "patched" } }),
    );
  });

  it("translates RecipeRepoError(not_found) to ToolError(not_found)", async () => {
    const { updateRecipeRow } = await import("@/lib/recipes");
    vi.mocked(updateRecipeRow).mockRejectedValueOnce(new RecipeRepoError("not_found", "missing"));
    await expect(updateRecipe({ id: "missing", status: "archived" })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("deleteRecipe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates to archiveRecipe and returns archived status", async () => {
    const { archiveRecipe } = await import("@/lib/recipes");
    vi.mocked(archiveRecipe).mockResolvedValueOnce(undefined);

    const out = await deleteRecipe({ id: "r1" });
    expect(out).toEqual({ id: "r1", status: "archived" });
    expect(archiveRecipe).toHaveBeenCalledWith("r1");
  });

  it("translates RecipeRepoError(not_found) to ToolError(not_found)", async () => {
    const { archiveRecipe } = await import("@/lib/recipes");
    vi.mocked(archiveRecipe).mockRejectedValueOnce(new RecipeRepoError("not_found", "missing"));
    await expect(deleteRecipe({ id: "missing" })).rejects.toMatchObject({ code: "not_found" });
  });
});
