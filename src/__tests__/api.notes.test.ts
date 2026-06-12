import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseClient as makeClient } from "@/fixtures/supabase";
import type { MakeSupabaseClientOptions } from "@/fixtures/supabase";
import { POST } from "@/app/api/recipes/[id]/notes/route";

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

function makeParams(id = "recipe-1") {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: object) {
  return new Request("http://localhost/api/recipes/recipe-1/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const storedRecipe = {
  id: "recipe-1",
  metadata: { schema: { name: "Test Recipe" } },
};

const makeSupabaseClient = (overrides: MakeSupabaseClientOptions = {}) =>
  makeClient({ recipe: storedRecipe, ...overrides });

describe("POST /api/recipes/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when recipe is not found", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ recipe: null, fetchError: { message: "Not found" } }) as never
    );

    const res = await POST(makeRequest({ cookingNotes: "more garlic" }), makeParams());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 500 when Supabase update fails", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ updateError: { message: "RLS violation" } }) as never
    );

    const res = await POST(makeRequest({ cookingNotes: "more garlic" }), makeParams());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to save/i);
  });

  it("returns 200 with ok:true on success", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(makeSupabaseClient() as never);

    const res = await POST(makeRequest({ cookingNotes: "reduce heat earlier" }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("saves cookingNotes merged into existing metadata schema", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const client = makeSupabaseClient();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await POST(makeRequest({ cookingNotes: "reduce heat earlier" }), makeParams());

    const updateCall = client.from.mock.results[1].value.update.mock.calls[0][0];
    expect(updateCall.metadata.schema.cookingNotes).toBe("reduce heat earlier");
    expect(updateCall.metadata.schema.name).toBe("Test Recipe");
  });

  it("saves cookingNotes as undefined when empty string is sent", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const client = makeSupabaseClient();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    await POST(makeRequest({ cookingNotes: "" }), makeParams());

    const updateCall = client.from.mock.results[1].value.update.mock.calls[0][0];
    expect(updateCall.metadata.schema.cookingNotes).toBeUndefined();
  });
});
