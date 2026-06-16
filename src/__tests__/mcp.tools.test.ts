// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { recipeFixtures } from "@/fixtures";

vi.mock("@/env", () => ({
  env: {
    OAUTH_JWT_SECRET: "x".repeat(32),
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

vi.mock("@/lib/storage", () => ({
  uploadRecipeImage: vi.fn(),
  fetchImageBytes: vi.fn(),
  StorageUploadError: class StorageUploadError extends Error {
    constructor(public kind: string, public detail: string) {
      super(`${kind}: ${detail}`);
      this.name = "StorageUploadError";
    }
  },
}));

import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  getToken,
  searchRecipes,
  ToolError,
  updateRecipe,
  uploadRecipeImage,
} from "@/lib/mcp/tools";
import { verifyRecipeToken } from "@/lib/mcp/recipeToken";
import { RecipeRepoError } from "@/lib/recipes";
import { StorageUploadError } from "@/lib/storage";

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

describe("getToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mints a 5-minute token scoped to an existing recipe", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(recipeFixtures[0]);

    const out = await getToken({ id: recipeFixtures[0].id });

    expect(out.recipeId).toBe(recipeFixtures[0].id);
    expect(out.expiresInSeconds).toBe(300);
    // The token is a real, verifiable recipe token bound to this id.
    expect(await verifyRecipeToken(out.token, recipeFixtures[0].id)).toBe(true);
    expect(await verifyRecipeToken(out.token, "some-other-id")).toBe(false);
  });

  it("throws ToolError(not_found) for a missing recipe", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(null);
    await expect(getToken({ id: "missing" })).rejects.toBeInstanceOf(ToolError);
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

describe("uploadRecipeImage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches via imageUrl, uploads, and writes the new URL into schema.image", async () => {
    const storage = await import("@/lib/storage");
    const { updateRecipeRow } = await import("@/lib/recipes");
    vi.mocked(storage.fetchImageBytes).mockResolvedValueOnce({
      bytes: Buffer.from([1, 2, 3, 4]),
      contentType: "image/jpeg",
    });
    vi.mocked(storage.uploadRecipeImage).mockResolvedValueOnce(
      "https://cdn.example.com/r1-from-url.jpg",
    );
    const updated = {
      ...recipeFixtures[0],
      metadata: {
        ...recipeFixtures[0].metadata,
        schema: {
          ...recipeFixtures[0].metadata.schema,
          image: "https://cdn.example.com/r1-from-url.jpg",
        },
      },
    };
    vi.mocked(updateRecipeRow).mockResolvedValueOnce(updated);

    const out = await uploadRecipeImage({
      id: "r1",
      imageUrl: "https://example.com/foo.jpg",
    });

    expect(storage.fetchImageBytes).toHaveBeenCalledWith("https://example.com/foo.jpg");
    expect(storage.uploadRecipeImage).toHaveBeenCalledWith(
      "r1",
      expect.any(Buffer),
      "image/jpeg",
    );
    expect(updateRecipeRow).toHaveBeenCalledWith("r1", {
      schema: { image: "https://cdn.example.com/r1-from-url.jpg" },
    });
    expect(out.metadata.schema.image).toBe(
      "https://cdn.example.com/r1-from-url.jpg",
    );
  });

  it("translates StorageUploadError(unsupported_type) to ToolError(unsupported_type)", async () => {
    const storage = await import("@/lib/storage");
    vi.mocked(storage.fetchImageBytes).mockResolvedValueOnce({
      bytes: Buffer.from([1, 2, 3, 4]),
      contentType: "image/png",
    });
    vi.mocked(storage.uploadRecipeImage).mockRejectedValueOnce(
      new StorageUploadError("unsupported_type", "bad ct"),
    );
    await expect(
      uploadRecipeImage({ id: "r1", imageUrl: "https://example.com/foo.png" }),
    ).rejects.toMatchObject({ code: "unsupported_type" });
  });

  it("translates RecipeRepoError(not_found) to ToolError(not_found)", async () => {
    const storage = await import("@/lib/storage");
    const { updateRecipeRow } = await import("@/lib/recipes");
    vi.mocked(storage.fetchImageBytes).mockResolvedValueOnce({
      bytes: Buffer.from([1, 2, 3, 4]),
      contentType: "image/png",
    });
    vi.mocked(storage.uploadRecipeImage).mockResolvedValueOnce(
      "https://cdn.example.com/x.png",
    );
    vi.mocked(updateRecipeRow).mockRejectedValueOnce(
      new RecipeRepoError("not_found", "missing"),
    );
    await expect(
      uploadRecipeImage({ id: "missing", imageUrl: "https://example.com/foo.png" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("translates StorageUploadError(bad_url) from the URL fetch into ToolError(bad_url)", async () => {
    const storage = await import("@/lib/storage");
    vi.mocked(storage.fetchImageBytes).mockRejectedValueOnce(
      new StorageUploadError("bad_url", "private IP"),
    );
    await expect(
      uploadRecipeImage({ id: "r1", imageUrl: "http://10.0.0.1/x.png" }),
    ).rejects.toMatchObject({ code: "bad_url" });
  });

  it("translates StorageUploadError(too_large) from the URL fetch into ToolError(too_large)", async () => {
    const storage = await import("@/lib/storage");
    vi.mocked(storage.fetchImageBytes).mockRejectedValueOnce(
      new StorageUploadError("too_large", "10MB body"),
    );
    await expect(
      uploadRecipeImage({ id: "r1", imageUrl: "https://example.com/big.png" }),
    ).rejects.toMatchObject({ code: "too_large" });
  });
});
