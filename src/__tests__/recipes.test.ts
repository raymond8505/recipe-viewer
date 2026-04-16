import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted ensures these run before vi.mock factories, which are hoisted above imports
const mockFeatures = vi.hoisted(() => ({
  filterByOwnSource: false,
  filterByStatus: false,
}));

const mockGetSupabaseClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/features", () => ({ getFeatures: () => mockFeatures }));
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: mockGetSupabaseClient }));

import { getRecipes, getRecipeById, getStatusCounts } from "@/lib/recipes";

/**
 * Builds a mock Supabase client whose query builder is fully chainable.
 * - Awaiting the builder (for getRecipes) resolves to { data, error, count }
 * - Calling .single() (for getRecipeById) resolves to { data: singleData, error: singleError }
 */
function makeSupabaseMock(opts: {
  data?: object[];
  count?: number;
  error?: object | null;
  singleData?: object | null;
  singleError?: object | null;
} = {}) {
  const { data = [], count = 0, error = null, singleData = null, singleError = null } = opts;

  const builder: Record<string, ReturnType<typeof vi.fn> | ((resolve: (v: unknown) => void, reject: (r: unknown) => void) => unknown)> = {
    select: vi.fn(),
    not: vi.fn(),
    range: vi.fn(),
    order: vi.fn(),
    in: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    or: vi.fn(),
    ilike: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: singleData, error: singleError }),
  };

  // Each chainable method returns the same builder
  (["select", "not", "range", "order", "in", "eq", "neq", "or", "ilike"] as const).forEach((key) => {
    (builder[key] as ReturnType<typeof vi.fn>).mockReturnValue(builder);
  });

  // Make the builder thenable so `await queryBuilder` works in getRecipes
  builder.then = (resolve: (v: unknown) => void, reject: (r: unknown) => void) =>
    Promise.resolve({ data, error, count }).then(resolve, reject);

  const client = { from: vi.fn().mockReturnValue(builder) };
  mockGetSupabaseClient.mockReturnValue(client);

  return { builder, client };
}

describe("getRecipes", () => {
  beforeEach(() => {
    mockFeatures.filterByOwnSource = false;
    mockFeatures.filterByStatus = false;
  });

  it("returns data and count from supabase", async () => {
    const data = [{ id: "1", url: "u", source: "s", metadata: { schema: { name: "Pasta" } } }];
    makeSupabaseMock({ data, count: 1 });

    const result = await getRecipes();
    expect(result.data).toEqual(data);
    expect(result.count).toBe(1);
  });

  it("defaults to page 1 with range 0–23 and sort newest", async () => {
    const { builder } = makeSupabaseMock();
    await getRecipes();

    expect(builder.range).toHaveBeenCalledWith(0, 23);
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("calculates the correct range for page 2 with default page size", async () => {
    const { builder } = makeSupabaseMock();
    await getRecipes({ page: 2 });

    expect(builder.range).toHaveBeenCalledWith(24, 47);
  });

  it("respects a custom limit", async () => {
    const { builder } = makeSupabaseMock();
    await getRecipes({ page: 2, limit: 10 });

    expect(builder.range).toHaveBeenCalledWith(10, 19);
  });

  it("applies ilike filter when query is provided", async () => {
    const { builder } = makeSupabaseMock();
    await getRecipes({ query: "pasta" });

    expect(builder.ilike).toHaveBeenCalledWith("metadata->schema->>name", "%pasta%");
  });

  it("does not apply ilike filter when query is absent", async () => {
    const { builder } = makeSupabaseMock();
    await getRecipes();

    expect(builder.ilike).not.toHaveBeenCalled();
  });

  it("applies status filter when filterByStatus is true", async () => {
    mockFeatures.filterByStatus = true;
    const { builder } = makeSupabaseMock();
    await getRecipes();

    expect(builder.eq).toHaveBeenCalledWith("status", "published");
  });

  it("does not apply status filter when filterByStatus is false", async () => {
    const { builder } = makeSupabaseMock();
    await getRecipes();

    expect(builder.eq).not.toHaveBeenCalled();
  });

  it("excludes archived recipes via or filter (includes null-status) when filterByStatus is false (logged-in)", async () => {
    const { builder } = makeSupabaseMock();
    await getRecipes();

    expect(builder.or).toHaveBeenCalledWith("status.neq.archived,status.is.null");
    expect(builder.neq).not.toHaveBeenCalled();
  });

  // Regression: null-status recipes were silently excluded by .neq("status","archived")
  // because NULL != 'archived' evaluates to NULL in PostgreSQL, not TRUE.
  // Note: mock cannot verify SQL NULL semantics — this test confirms the correct filter
  // method is called; validate against a real DB if this regresses in production.
  it("includes null-status recipes in the logged-in default view", async () => {
    const nullStatusRecipe = { id: "99", url: "u", source: "s", status: null, metadata: { schema: { name: "Test" } } };
    const { builder } = makeSupabaseMock({ data: [nullStatusRecipe], count: 1 });
    const result = await getRecipes();

    // The correct .or() filter is what causes null rows to be returned in production;
    // the mock returns them regardless, but confirms the method call is the right one.
    expect(builder.or).toHaveBeenCalledWith("status.neq.archived,status.is.null");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe("99");
  });

  it("does not apply or filter when filterByStatus is true (logged-out, published eq filter covers it)", async () => {
    mockFeatures.filterByStatus = true;
    const { builder } = makeSupabaseMock();
    await getRecipes();

    expect(builder.or).not.toHaveBeenCalled();
    expect(builder.neq).not.toHaveBeenCalled();
  });

  it("sorts by created_at ascending for 'oldest'", async () => {
    const { builder } = makeSupabaseMock();
    await getRecipes({ sort: "oldest" });

    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("sorts by name ascending for 'name-asc'", async () => {
    const { builder } = makeSupabaseMock();
    await getRecipes({ sort: "name-asc" });

    expect(builder.order).toHaveBeenCalledWith("metadata->schema->>name", { ascending: true });
  });

  it("sorts by name descending for 'name-desc'", async () => {
    const { builder } = makeSupabaseMock();
    await getRecipes({ sort: "name-desc" });

    expect(builder.order).toHaveBeenCalledWith("metadata->schema->>name", { ascending: false });
  });

  it("returns empty data and zero count on supabase error", async () => {
    makeSupabaseMock({ error: { message: "DB error" } });
    const result = await getRecipes();

    expect(result.data).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("applies eq status filter and skips neq when status option is provided (logged-in)", async () => {
    const { builder } = makeSupabaseMock();
    await getRecipes({ status: "draft" });

    expect(builder.eq).toHaveBeenCalledWith("status", "draft");
    expect(builder.neq).not.toHaveBeenCalled();
  });

  it("applies eq status filter for archived when status=archived (logged-in)", async () => {
    const { builder } = makeSupabaseMock();
    await getRecipes({ status: "archived" });

    expect(builder.eq).toHaveBeenCalledWith("status", "archived");
    expect(builder.neq).not.toHaveBeenCalled();
  });
});

describe("getStatusCounts", () => {
  beforeEach(() => {
    mockFeatures.filterByOwnSource = false;
    mockFeatures.filterByStatus = false;
  });

  it("returns empty object on supabase error", async () => {
    makeSupabaseMock({ error: { message: "DB error" } });
    const result = await getStatusCounts();

    expect(result).toEqual({});
  });

  it("counts statuses from returned rows, including null-status rows under __null", async () => {
    makeSupabaseMock({
      data: [
        { status: "published" },
        { status: "published" },
        { status: "draft" },
        { status: "archived" },
        { status: null },
        { status: null },
      ],
    });
    const result = await getStatusCounts();

    expect(result).toEqual({ published: 2, draft: 1, archived: 1, __null: 2 });
  });

  it("applies ilike filter when query is provided", async () => {
    const { builder } = makeSupabaseMock({ data: [] });
    await getStatusCounts({ query: "pasta" });

    expect(builder.ilike).toHaveBeenCalledWith("metadata->schema->>name", "%pasta%");
  });

  it("applies source eq filter when source is provided", async () => {
    const { builder } = makeSupabaseMock({ data: [] });
    await getStatusCounts({ source: "raymonds.recipes" });

    expect(builder.eq).toHaveBeenCalledWith("source", "raymonds.recipes");
  });

  it("does not apply any status eq or neq filter", async () => {
    const { builder } = makeSupabaseMock({ data: [] });
    await getStatusCounts();

    expect(builder.eq).not.toHaveBeenCalled();
    expect(builder.neq).not.toHaveBeenCalled();
  });

});

describe("getRecipeById", () => {
  it("returns the recipe when found", async () => {
    const recipe = { id: "42", url: "u", source: "s", metadata: { schema: { name: "Pizza" } } };
    makeSupabaseMock({ singleData: recipe });

    const result = await getRecipeById("42");
    expect(result).toEqual(recipe);
  });

  it("returns null when record is not found", async () => {
    makeSupabaseMock({ singleData: null });

    const result = await getRecipeById("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null on supabase error", async () => {
    makeSupabaseMock({ singleError: { message: "not found" } });

    const result = await getRecipeById("bad-id");
    expect(result).toBeNull();
  });

  it("normalizes string recipeInstructions to an array", async () => {
    const recipe = {
      id: "99",
      url: "u",
      source: "s",
      metadata: { schema: { name: "Soup", recipeInstructions: "Boil water." } },
    };
    makeSupabaseMock({ singleData: recipe });

    const result = await getRecipeById("99");
    expect(Array.isArray(result!.metadata.schema.recipeInstructions)).toBe(true);
    expect((result!.metadata.schema.recipeInstructions as { text: string }[])[0].text).toBe("Boil water.");
  });
});
