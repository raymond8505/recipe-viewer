import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseClient as makeClient } from "@/fixtures/supabase";
import type { MakeSupabaseClientOptions } from "@/fixtures/supabase";
import { POST } from "@/app/api/recipes/[id]/archive/route";

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

const storedRecipe = {
  id: "recipe-1",
  status: "published",
  metadata: { schema: { name: "Test Recipe" } },
};

const makeSupabaseClient = (overrides: MakeSupabaseClientOptions = {}) =>
  makeClient({ recipe: storedRecipe, ...overrides });

describe("POST /api/recipes/[id]/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when recipe is not found", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ recipe: null, fetchError: { message: "Not found" } }) as never
    );

    const res = await POST(new Request("http://localhost/", { method: "POST" }), makeParams());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 500 when Supabase update fails", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ updateError: { message: "RLS violation" } }) as never
    );

    const res = await POST(new Request("http://localhost/", { method: "POST" }), makeParams());
    expect(res.status).toBe(500);
  });

  it("returns 200 with ok: true on success", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);

    const res = await POST(new Request("http://localhost/", { method: "POST" }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("sets status column to archived", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const client = makeSupabaseClient({
      recipe: { id: "recipe-1", status: "published", metadata: { schema: { name: "Test Recipe" } } },
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await POST(new Request("http://localhost/", { method: "POST" }), makeParams());

    const updateCall = vi.mocked(client.from).mock.results[1]?.value.update as ReturnType<typeof vi.fn>;
    expect(updateCall).toHaveBeenCalledWith({ status: "archived" });
  });
});
