// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "@/env";
import { makeSupabaseClient } from "@/fixtures/supabase";
import { POST } from "@/app/api/recipes/[id]/upload-image/route";

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

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

// updateRecipeRow's select/update/select chain doesn't match the shared
// makeSupabaseClient mock, so it's mocked at the module boundary instead.
vi.mock("@/lib/recipes", () => ({
  updateRecipeRow: vi.fn(),
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
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
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ recipe: null, fetchError: { message: "Not found" } }) as never,
    );

    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3])));
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(404);
  });

  it("returns 400 when file field is missing", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);

    const form = new FormData();
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(400);
  });

  it("returns 415 for unsupported content types", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);

    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3]), "image/gif", "x.gif"));
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(415);
  });

  it("returns 413 when file exceeds the size cap", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);

    const big = new Uint8Array(env.MAX_IMAGE_BYTES + 1);
    const form = new FormData();
    form.append("file", makeFile(big));
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(413);
  });

  it("returns 200 with the public URL on success", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const storage = await import("@/lib/storage");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
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

  it("does not touch the recipe row by default", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const storage = await import("@/lib/storage");
    const recipes = await import("@/lib/recipes");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.mocked(storage.uploadRecipeImage).mockResolvedValueOnce(
      "https://cdn.example.com/recipe-1-123.png",
    );

    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3])));
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(200);
    expect(recipes.updateRecipeRow).not.toHaveBeenCalled();
  });

  it("updates schema.image when updateSchema=true", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const storage = await import("@/lib/storage");
    const recipes = await import("@/lib/recipes");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
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
    const { getSupabaseClient } = await import("@/lib/supabase");
    const storage = await import("@/lib/storage");
    const recipes = await import("@/lib/recipes");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
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
    const { getSupabaseClient } = await import("@/lib/supabase");
    const storage = await import("@/lib/storage");
    const { consumeRequestToken } = await import("@/lib/apiAuth");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
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
    const { getSupabaseClient } = await import("@/lib/supabase");
    const storage = await import("@/lib/storage");
    const recipes = await import("@/lib/recipes");
    const { consumeRequestToken } = await import("@/lib/apiAuth");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
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
    const { getSupabaseClient } = await import("@/lib/supabase");
    const storage = await import("@/lib/storage");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);
    vi.mocked(storage.uploadRecipeImage).mockRejectedValueOnce(
      new storage.StorageUploadError("upload_failed", "boom"),
    );

    const form = new FormData();
    form.append("file", makeFile(new Uint8Array([1, 2, 3])));
    const res = await POST(makeRequest(form), makeParams());

    expect(res.status).toBe(502);
  });
});
