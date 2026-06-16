// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "@/env";
import { makeRecipe } from "@/fixtures";
import { POST } from "@/app/api/recipes/[id]/upload-image/route";

// Authorized by default; the dedicated 401 test overrides this per-call.
vi.mock("@/lib/apiAuth", () => ({
  requireApiAuth: vi.fn().mockResolvedValue(null),
  consumeRequestToken: vi.fn().mockResolvedValue(undefined),
}));

// SKIP_ENV_VALIDATION in vitest config skips the zod parse, so env defaults
// don't apply in tests — the cap must be mocked (factory literal: vi.mock is
// hoisted and can't close over module consts).
vi.mock("@/env", () => ({
  env: { MAX_IMAGE_BYTES: 4_000_000 },
}));

vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>(
    "@/lib/storage",
  );
  return {
    ...actual,
    uploadRecipeImage: vi.fn(),
  };
});

// The route reads the recipe (existence) and optionally writes schema.image
// through the repo layer; mock both helpers, keep the real RecipeRepoError.
vi.mock("@/lib/recipes", async (orig) => {
  const actual = await orig<typeof import("@/lib/recipes")>();
  return { ...actual, getRecipeById: vi.fn(), updateRecipeRow: vi.fn() };
});

const storedRecipe = makeRecipe("recipe-1", "Test Recipe");

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(form: FormData) {
  return new Request("http://localhost/api/recipes/recipe-1/upload-image", {
    method: "POST",
    body: form,
  });
}

function makeFile(bytes: Uint8Array, type = "image/png", name = "x.png") {
  return new File([bytes], name, { type });
}

describe("POST /api/recipes/[id]/upload-image", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValue(storedRecipe);
  });

  it("returns 401 when the request is unauthorized", async () => {
    const { requireApiAuth } = await import("@/lib/apiAuth");
    vi.mocked(requireApiAuth).mockResolvedValueOnce(
      new Response(null, { status: 401 }),
    );

    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3])));
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(401);
  });

  it("returns 404 when recipe is not found", async () => {
    const { getRecipeById } = await import("@/lib/recipes");
    vi.mocked(getRecipeById).mockResolvedValueOnce(null);

    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3])));
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(404);
  });

  it("returns 400 when file field is missing", async () => {
    const form = new FormData();
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(400);
  });

  it("returns 415 for unsupported content types", async () => {
    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3]), "image/gif", "x.gif"));
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(415);
  });

  it("returns 413 when file exceeds the size cap", async () => {
    const big = new Uint8Array(env.MAX_IMAGE_BYTES + 1);
    const form = new FormData();
    form.append("file", makeFile(big));
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(413);
  });

  it("returns 200 with the public URL on success", async () => {
    const storage = await import("@/lib/storage");
    vi.mocked(storage.uploadRecipeImage).mockResolvedValueOnce(
      "https://cdn.example.com/recipe-1-123.png",
    );

    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3])));
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.image).toBe("https://cdn.example.com/recipe-1-123.png");
    expect(storage.uploadRecipeImage).toHaveBeenCalledWith(
      "recipe-1",
      expect.any(Uint8Array),
      "image/png",
    );
  });

  it("updates schema.image by default (no updateSchema field)", async () => {
    const storage = await import("@/lib/storage");
    const recipes = await import("@/lib/recipes");
    vi.mocked(storage.uploadRecipeImage).mockResolvedValueOnce(
      "https://cdn.example.com/recipe-1-123.png",
    );
    vi.mocked(recipes.updateRecipeRow).mockResolvedValueOnce({} as never);

    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3])));
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(200);
    expect(recipes.updateRecipeRow).toHaveBeenCalledWith("recipe-1", {
      schema: { image: "https://cdn.example.com/recipe-1-123.png" },
    });
  });

  it.each(["false", "0"])(
    "does not touch the recipe row when updateSchema=%s",
    async (optOut) => {
      const storage = await import("@/lib/storage");
      const recipes = await import("@/lib/recipes");
      vi.mocked(storage.uploadRecipeImage).mockResolvedValueOnce(
        "https://cdn.example.com/recipe-1-123.png",
      );

      const form = new FormData();
      form.append("file", makeFile(new Uint8Array([1, 2, 3])));
      form.append("updateSchema", optOut);
      const res = await POST(makeRequest(form), makeParams());

      expect(res.status).toBe(200);
      expect(recipes.updateRecipeRow).not.toHaveBeenCalled();
    },
  );

  it("updates schema.image when updateSchema=true", async () => {
    const storage = await import("@/lib/storage");
    const recipes = await import("@/lib/recipes");
    vi.mocked(storage.uploadRecipeImage).mockResolvedValueOnce(
      "https://cdn.example.com/recipe-1-123.png",
    );
    vi.mocked(recipes.updateRecipeRow).mockResolvedValueOnce({} as never);

    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3])));
    form.append("updateSchema", "true");
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.image).toBe("https://cdn.example.com/recipe-1-123.png");
    expect(recipes.updateRecipeRow).toHaveBeenCalledWith("recipe-1", {
      schema: { image: "https://cdn.example.com/recipe-1-123.png" },
    });
  });

  it("returns 502 with the image URL when the upload succeeds but the row update fails", async () => {
    const storage = await import("@/lib/storage");
    const recipes = await import("@/lib/recipes");
    vi.mocked(storage.uploadRecipeImage).mockResolvedValueOnce(
      "https://cdn.example.com/recipe-1-123.png",
    );
    vi.mocked(recipes.updateRecipeRow).mockRejectedValueOnce(
      new Error("update failed"),
    );

    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3])));
    form.append("updateSchema", "true");
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/updating the recipe failed/);
    expect(body.image).toBe("https://cdn.example.com/recipe-1-123.png");
  });

  it("consumes the upload token on a successful upload", async () => {
    const storage = await import("@/lib/storage");
    const { consumeRequestToken } = await import("@/lib/apiAuth");
    vi.mocked(storage.uploadRecipeImage).mockResolvedValueOnce(
      "https://cdn.example.com/recipe-1-123.png",
    );

    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3])));
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(200);
    expect(consumeRequestToken).toHaveBeenCalledTimes(1);
  });

  it("does NOT consume the token when the row update fails (502)", async () => {
    const storage = await import("@/lib/storage");
    const recipes = await import("@/lib/recipes");
    const { consumeRequestToken } = await import("@/lib/apiAuth");
    vi.mocked(storage.uploadRecipeImage).mockResolvedValueOnce(
      "https://cdn.example.com/recipe-1-123.png",
    );
    vi.mocked(recipes.updateRecipeRow).mockRejectedValueOnce(
      new Error("update failed"),
    );

    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3])));
    form.append("updateSchema", "true");
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(502);
    expect(consumeRequestToken).not.toHaveBeenCalled();
  });

  it("returns 502 when storage upload fails", async () => {
    const storage = await import("@/lib/storage");
    vi.mocked(storage.uploadRecipeImage).mockRejectedValueOnce(
      new storage.StorageUploadError("upload_failed", "boom"),
    );

    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3])));
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(502);
  });
});
