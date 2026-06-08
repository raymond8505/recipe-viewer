// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { recipeFixtures } from "@/fixtures";

vi.mock("@/env", () => ({
  env: { OAUTH_JWT_SECRET: "x".repeat(32), MCP_PUBLIC_URL: "http://localhost:3000" },
}));

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));
vi.mock("@/lib/recipes", () => ({
  getRecipes: vi.fn(),
  getRecipeById: vi.fn(),
}));

import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  searchRecipes,
  ToolError,
  updateRecipe,
} from "@/lib/mcp/tools";

interface SingleResult {
  data: unknown;
  error: { message: string } | null;
}

function makeSupabaseClient({
  selectSingle,
  insertSingle,
  updateSingle,
  updateError,
}: {
  selectSingle?: SingleResult;
  insertSingle?: SingleResult;
  updateSingle?: SingleResult;
  updateError?: { message: string } | null;
} = {}) {
  const selectChain = {
    eq: vi.fn(() => ({
      single: vi.fn().mockResolvedValue(selectSingle ?? { data: null, error: null }),
    })),
  };

  const insertChain = {
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue(insertSingle ?? { data: null, error: null }),
    })),
  };

  const updateChain = {
    eq: vi.fn(() => {
      const withSelect = {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue(updateSingle ?? { data: null, error: null }),
        })),
      };
      // Allow chains that don't call .select() (e.g. delete) by also being thenable.
      return Object.assign(
        Promise.resolve({ error: updateError ?? null }),
        withSelect,
      );
    }),
  };

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    })),
  };
}

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

  it("inserts a row with status defaulted to draft", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const inserted = {
      id: "new-id",
      url: "https://example.com/r",
      source: "example.com",
      status: "draft",
      metadata: { schema: { name: "New" } },
    };
    const client = makeSupabaseClient({ insertSingle: { data: inserted, error: null } });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    const out = await createRecipe({
      url: "https://example.com/r",
      source: "example.com",
      schema: { name: "New" },
    });
    expect(out.id).toBe("new-id");
    expect(client.from).toHaveBeenCalledWith("recipes");
  });

  it("throws ToolError(create_failed) on Supabase error", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ insertSingle: { data: null, error: { message: "RLS" } } }) as never,
    );
    await expect(
      createRecipe({ url: "https://example.com/r", source: "x", schema: { name: "X" } }),
    ).rejects.toBeInstanceOf(ToolError);
  });
});

describe("updateRecipe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("merges partial schema into existing metadata", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const existing = recipeFixtures[0];
    const updated = {
      ...existing,
      metadata: { schema: { ...existing.metadata.schema, description: "patched" } },
    };
    const client = makeSupabaseClient({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: updated, error: null },
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    const out = await updateRecipe({ id: existing.id, schema: { description: "patched" } });
    expect(out.metadata.schema.description).toBe("patched");
    expect(out.metadata.schema.name).toBe(existing.metadata.schema.name);
  });

  it("returns existing row unchanged when no patch fields provided", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const existing = recipeFixtures[0];
    const client = makeSupabaseClient({ selectSingle: { data: existing, error: null } });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    const out = await updateRecipe({ id: existing.id });
    expect(out).toEqual(existing);
  });

  it("throws ToolError(not_found) when row is missing", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ selectSingle: { data: null, error: { message: "no row" } } }) as never,
    );
    await expect(updateRecipe({ id: "missing", status: "archived" })).rejects.toBeInstanceOf(ToolError);
  });
});

describe("deleteRecipe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soft-deletes by setting status=archived", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const client = makeSupabaseClient({
      selectSingle: { data: { id: "r1" }, error: null },
    });
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);

    const out = await deleteRecipe({ id: "r1" });
    expect(out).toEqual({ id: "r1", status: "archived" });

    const updateCall = vi.mocked(client.from).mock.results[1]?.value.update as ReturnType<typeof vi.fn>;
    expect(updateCall).toHaveBeenCalledWith({ status: "archived" });
  });

  it("throws ToolError(not_found) for missing id", async () => {
    const { getSupabaseClient } = await import("@/lib/supabase");
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeSupabaseClient({ selectSingle: { data: null, error: null } }) as never,
    );
    await expect(deleteRecipe({ id: "missing" })).rejects.toBeInstanceOf(ToolError);
  });
});
