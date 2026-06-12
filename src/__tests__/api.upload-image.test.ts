// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/recipes/[id]/upload-image/route";

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
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

function makeSupabaseClient({
  recipe = { id: "recipe-1" } as object | null,
  fetchError = null as object | null,
} = {}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: recipe, error: fetchError }),
        })),
      })),
    })),
  };
}

describe("POST /api/recipes/[id]/upload-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const big = new Uint8Array(4_000_001);
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
