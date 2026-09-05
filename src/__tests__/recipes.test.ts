import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted ensures these run before vi.mock factories, which are hoisted above imports
const mockFeatures = vi.hoisted(() => ({
  filterByOwnSource: false,
  filterByStatus: false,
}));

const mockGetSupabaseClient = vi.hoisted(() => vi.fn());
// Embedding generation hits the network; mock it. Default: no embedding
// available (null), so write paths don't set the column unless a test opts in.
const mockGenerateEmbedding = vi.hoisted(() => vi.fn().mockResolvedValue(null));
// The write paths schedule post-response ingredient normalization; mock the
// trigger so repo tests never start detached LangGraph runs. The fingerprint
// module stays REAL — the should-normalize tests exercise the actual
// ingredient-text comparison.
const mockScheduleNormalization = vi.hoisted(() => vi.fn());
const mockSyncRecipeIngredientText = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/features", () => ({ getFeatures: () => mockFeatures }));
// importOriginal keeps toVectorLiteral real — the embedding tests assert the
// actual bracketed pgvector literal the write paths produce.
vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase")>();
  return { ...actual, getSupabaseClient: mockGetSupabaseClient };
});
vi.mock("@/lib/embedding", () => ({ generateEmbedding: mockGenerateEmbedding }));
vi.mock("@/lib/normalization/syncLines", () => ({
  syncRecipeIngredientText: mockSyncRecipeIngredientText,
}));
vi.mock("@/lib/normalization/trigger", () => ({
  scheduleNormalization: mockScheduleNormalization,
}));

import {
  createRecipeRow,
  getRecipes,
  getRecipeById,
  getStatusCounts,
  RecipeRepoError,
  updateRecipeRow,
} from "@/lib/recipes";
import { schemaToMarkdown } from "@/lib/format";

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
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    makeSupabaseMock({ error: { message: "DB error" } });
    const result = await getRecipes();

    expect(result.data).toEqual([]);
    expect(result.count).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(
      "Supabase error fetching recipes:",
      expect.anything(),
    );
    errorSpy.mockRestore();
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

/**
 * Write-op mock — captures the row passed to insert()/update() so tests can
 * assert what columns are being set, then short-circuits the supabase chain
 * with the canned return payload.
 */
function makeWriteSupabaseMock(opts: {
  selectSingle?: { data: object | null; error: object | null };
  insertSingle?: { data: object | null; error: object | null };
  updateSingle?: { data: object | null; error: object | null };
} = {}) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];

  const selectChain = {
    eq: vi.fn(() => ({
      single: vi.fn().mockResolvedValue(opts.selectSingle ?? { data: null, error: null }),
    })),
  };

  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => selectChain),
      insert: vi.fn((row: Record<string, unknown>) => {
        inserts.push(row);
        return {
          select: vi.fn(() => ({
            single: vi
              .fn()
              .mockResolvedValue(opts.insertSingle ?? { data: null, error: null }),
          })),
        };
      }),
      update: vi.fn((row: Record<string, unknown>) => {
        updates.push(row);
        return {
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi
                .fn()
                .mockResolvedValue(opts.updateSingle ?? { data: null, error: null }),
            })),
          })),
        };
      }),
    })),
  };

  mockGetSupabaseClient.mockReturnValue(client);
  return { client, inserts, updates };
}

describe("createRecipeRow", () => {
  beforeEach(() => {
    mockGenerateEmbedding.mockReset().mockResolvedValue(null);
  });

  it("stores the markdown rendering of the schema in content + the name column", async () => {
    const schema = { name: "Soup", description: "Hot broth." };
    const inserted = {
      id: "new",
      url: "https://example.com",
      source: "example.com",
      status: "draft",
      metadata: { schema },
    };
    const { inserts } = makeWriteSupabaseMock({ insertSingle: { data: inserted, error: null } });

    await createRecipeRow({
      url: "https://example.com",
      source: "example.com",
      schema,
    });

    expect(inserts[0]).toMatchObject({
      name: "Soup",
      content: schemaToMarkdown(schema),
      url: "https://example.com",
      source: "example.com",
      status: "draft",
    });
  });

  it("includes the embedding as a pgvector literal when generation succeeds", async () => {
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    const { inserts } = makeWriteSupabaseMock({
      insertSingle: { data: { id: "x" }, error: null },
    });

    await createRecipeRow({
      url: "https://example.com",
      source: "example.com",
      schema: { name: "Vec" },
    });

    expect(inserts[0]).toMatchObject({ embedding: "[0.1,0.2,0.3]" });
  });

  it("omits the embedding column when generation fails (null)", async () => {
    mockGenerateEmbedding.mockResolvedValueOnce(null);
    const { inserts } = makeWriteSupabaseMock({
      insertSingle: { data: { id: "x" }, error: null },
    });

    await createRecipeRow({
      url: "https://example.com",
      source: "example.com",
      schema: { name: "NoVec" },
    });

    expect(inserts[0]).not.toHaveProperty("embedding");
  });

  it("throws RecipeRepoError(insert_failed) on Supabase error", async () => {
    makeWriteSupabaseMock({ insertSingle: { data: null, error: { message: "RLS" } } });

    await expect(
      createRecipeRow({
        url: "https://example.com",
        source: "example.com",
        schema: { name: "X" },
      }),
    ).rejects.toBeInstanceOf(RecipeRepoError);
  });

  it("schedules normalization for the inserted row when the schema has ingredients", async () => {
    mockScheduleNormalization.mockClear();
    makeWriteSupabaseMock({
      insertSingle: { data: { id: "new-id" }, error: null },
    });

    await createRecipeRow({
      url: "https://example.com",
      source: "example.com",
      schema: { name: "Soup", recipeIngredient: ["1 tsp cumin"] },
    });

    expect(mockScheduleNormalization).toHaveBeenCalledWith("new-id");
  });

  it("does not schedule normalization when the schema has no ingredients", async () => {
    mockScheduleNormalization.mockClear();
    makeWriteSupabaseMock({
      insertSingle: { data: { id: "new-id" }, error: null },
    });

    await createRecipeRow({
      url: "https://example.com",
      source: "example.com",
      schema: { name: "Soup" },
    });

    expect(mockScheduleNormalization).not.toHaveBeenCalled();
  });
});

describe("updateRecipeRow", () => {
  const existing = {
    id: "r1",
    url: "https://example.com",
    source: "example.com",
    status: "published",
    metadata: { schema: { name: "Original", description: "Old blurb" } },
  };

  beforeEach(() => {
    mockGenerateEmbedding.mockReset().mockResolvedValue(null);
  });

  it("syncs the top-level name column when schema.name changes (bug fix)", async () => {
    const { updates } = makeWriteSupabaseMock({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", { schema: { name: "Renamed" } });

    expect(updates[0]).toMatchObject({ name: "Renamed" });
    // metadata.schema should still be merged
    expect((updates[0].metadata as { schema: { name: string } }).schema.name).toBe("Renamed");
  });

  it("recomputes content as the markdown of the merged schema on any schema change", async () => {
    const { updates } = makeWriteSupabaseMock({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", { schema: { description: "Fresh blurb" } });

    const mergedSchema = { name: "Original", description: "Fresh blurb" };
    expect(updates[0]).toMatchObject({ content: schemaToMarkdown(mergedSchema) });
  });

  it("sets the embedding from the merged schema when generation succeeds", async () => {
    mockGenerateEmbedding.mockResolvedValueOnce([0.5, 0.5]);
    const { updates } = makeWriteSupabaseMock({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", { schema: { description: "Fresh blurb" } });

    expect(updates[0]).toMatchObject({ embedding: "[0.5,0.5]" });
  });

  it("leaves the embedding column untouched when generation fails (null)", async () => {
    mockGenerateEmbedding.mockResolvedValueOnce(null);
    const { updates } = makeWriteSupabaseMock({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", { schema: { description: "Fresh blurb" } });

    expect(updates[0]).not.toHaveProperty("embedding");
  });

  it("does not touch name/content/embedding when schema patch omits the schema field", async () => {
    const { updates } = makeWriteSupabaseMock({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", { status: "archived" });

    expect(updates[0]).not.toHaveProperty("name");
    expect(updates[0]).not.toHaveProperty("content");
    expect(updates[0]).not.toHaveProperty("embedding");
    expect(updates[0]).toMatchObject({ status: "archived" });
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  // A recipe written before line ids existed gets one minted per line on its
  // first save. That is bookkeeping, not a structural edit — reading it as "N
  // new lines" would re-run the matcher over a reword, which is exactly what
  // ids were introduced to stop. Sync carries the text AND stamps the ids.
  it("does not schedule normalization when a legacy id-less line is reworded", async () => {
    mockScheduleNormalization.mockClear();
    mockSyncRecipeIngredientText.mockClear();
    makeWriteSupabaseMock({
      selectSingle: {
        data: {
          ...existing,
          metadata: { schema: { name: "Original", recipeIngredient: ["1 tsp cumin"] } },
        },
        error: null,
      },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", {
      schema: { recipeIngredient: ["2 tsp cumin"] },
    });

    expect(mockScheduleNormalization).not.toHaveBeenCalled();
    expect(mockSyncRecipeIngredientText).toHaveBeenCalledWith("r1", [
      { name: "2 tsp cumin", id: expect.any(String) },
    ]);
  });

  // Minting also has to reach the rows, which only sync can do — so it runs
  // even though the text itself never moved.
  it("syncs a legacy line whose text is unchanged, to stamp its new id", async () => {
    mockScheduleNormalization.mockClear();
    mockSyncRecipeIngredientText.mockClear();
    makeWriteSupabaseMock({
      selectSingle: {
        data: {
          ...existing,
          metadata: { schema: { name: "Original", recipeIngredient: ["1 tsp cumin"] } },
        },
        error: null,
      },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", {
      schema: { recipeIngredient: ["1 tsp cumin"] },
    });

    expect(mockScheduleNormalization).not.toHaveBeenCalled();
    expect(mockSyncRecipeIngredientText).toHaveBeenCalledWith("r1", [
      { name: "1 tsp cumin", id: expect.any(String) },
    ]);
  });

  it("schedules normalization when a legacy array gains a line", async () => {
    mockScheduleNormalization.mockClear();
    makeWriteSupabaseMock({
      selectSingle: {
        data: {
          ...existing,
          metadata: { schema: { name: "Original", recipeIngredient: ["1 tsp cumin"] } },
        },
        error: null,
      },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", {
      schema: { recipeIngredient: ["1 tsp cumin", "2 cups rice"] },
    });

    expect(mockScheduleNormalization).toHaveBeenCalledWith("r1");
  });

  it("schedules normalization when a legacy array loses a line", async () => {
    mockScheduleNormalization.mockClear();
    makeWriteSupabaseMock({
      selectSingle: {
        data: {
          ...existing,
          metadata: {
            schema: {
              name: "Original",
              recipeIngredient: ["1 tsp cumin", "2 cups rice"],
            },
          },
        },
        error: null,
      },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", {
      schema: { recipeIngredient: ["1 tsp cumin"] },
    });

    expect(mockScheduleNormalization).toHaveBeenCalledWith("r1");
  });

  it("does not schedule normalization when the patch omits recipeIngredient", async () => {
    mockScheduleNormalization.mockClear();
    makeWriteSupabaseMock({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", { schema: { description: "Fresh blurb" } });

    expect(mockScheduleNormalization).not.toHaveBeenCalled();
  });

  it("does not schedule normalization when the ingredient text is unchanged", async () => {
    mockScheduleNormalization.mockClear();
    makeWriteSupabaseMock({
      selectSingle: {
        data: {
          ...existing,
          metadata: {
            schema: {
              name: "Original",
              recipeIngredient: [{ name: "1 tsp cumin", group: "Spices", id: "L1" }],
            },
          },
        },
        error: null,
      },
      updateSingle: { data: existing, error: null },
    });

    // Same ingredient TEXT (getIngredientText), different representation —
    // regrouping alone must not re-run normalization. The bare string carries
    // no id, so withLineIds inherits L1 by text: the line SET is unchanged and
    // there is nothing new to guess.
    await updateRecipeRow("r1", {
      schema: { recipeIngredient: ["1 tsp cumin"] },
    });

    expect(mockScheduleNormalization).not.toHaveBeenCalled();
  });

  // Normalization guesses associations for lines that lack them, so the only
  // thing that gives it work is a line appearing or disappearing. Rewording is
  // handled by a deterministic re-parse (syncRecipeIngredientText) instead —
  // re-running the matcher there would overwrite the user's own corrections.
  it("does not schedule normalization when a line is only reworded", async () => {
    mockScheduleNormalization.mockClear();
    mockSyncRecipeIngredientText.mockClear();
    makeWriteSupabaseMock({
      selectSingle: {
        data: {
          ...existing,
          metadata: {
            schema: { name: "Original", recipeIngredient: [{ name: "1 tsp cumin", id: "L1" }] },
          },
        },
        error: null,
      },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", {
      schema: { recipeIngredient: [{ name: "1 tsp ground cumin", id: "L1" }] },
    });

    expect(mockScheduleNormalization).not.toHaveBeenCalled();
    // The text still has to reach the row — just deterministically, without a
    // matcher run that could overwrite the association.
    expect(mockSyncRecipeIngredientText).toHaveBeenCalledWith("r1", [
      { name: "1 tsp ground cumin", id: "L1" },
    ]);
  });

  it("schedules normalization when a line is added", async () => {
    mockScheduleNormalization.mockClear();
    makeWriteSupabaseMock({
      selectSingle: {
        data: {
          ...existing,
          metadata: {
            schema: { name: "Original", recipeIngredient: [{ name: "1 tsp cumin", id: "L1" }] },
          },
        },
        error: null,
      },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", {
      schema: {
        recipeIngredient: [{ name: "1 tsp cumin", id: "L1" }, "2 cups rice"],
      },
    });

    expect(mockScheduleNormalization).toHaveBeenCalledWith("r1");
  });

  it("preserves line ids a patch hands back, and mints only for new lines", async () => {
    const { updates } = makeWriteSupabaseMock({
      selectSingle: {
        data: {
          ...existing,
          metadata: {
            schema: { name: "Original", recipeIngredient: [{ name: "1 tsp cumin", id: "L1" }] },
          },
        },
        error: null,
      },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", {
      schema: {
        recipeIngredient: [{ name: "1 tsp ground cumin", id: "L1" }, "2 cups rice"],
      },
    });

    const lines = (
      updates[0].metadata as {
        schema: { recipeIngredient: Array<{ name: string; id?: string }> };
      }
    ).schema.recipeIngredient;
    // The reworded line keeps its id — that id is what its derived row and the
    // association on it are keyed to, so re-minting would orphan both.
    expect(lines[0]).toMatchObject({ name: "1 tsp ground cumin", id: "L1" });
    expect(lines[1].name).toBe("2 cups rice");
    expect(lines[1].id).toEqual(expect.any(String));
    expect(lines[1].id).not.toBe("L1");
  });
});

// ---------------------------------------------------------------------------
// The 0019 hydrate/extract seam. The columns are the source of truth; the
// metadata.schema copies are dead artifacts, and the repo layer is the only
// thing that knows it. Every test here fixes a way that could quietly stop
// being true — a missed read exit, or a write that repopulates the artifact.
// ---------------------------------------------------------------------------
describe("recipe time columns", () => {
  // The blob says 999 minutes and the columns say 20/35/55. A row shaped like
  // this exists for real: the backfill copied the times forward and then the
  // user edited them, leaving the blob frozen at its pre-0019 value.
  const staleBlobRow = {
    id: "r1",
    url: "https://example.com",
    source: "example.com",
    status: "published",
    prep_time: 20,
    cook_time: 35,
    total_time: 55,
    metadata: {
      schema: {
        name: "Enchiladas",
        prepTime: "PT999M",
        cookTime: "PT999M",
        totalTime: "PT999M",
      },
    },
  };

  beforeEach(() => {
    mockGenerateEmbedding.mockReset().mockResolvedValue(null);
  });

  it("reads times from the columns, not the stale blob copy", async () => {
    makeSupabaseMock({ singleData: structuredClone(staleBlobRow) });

    const row = await getRecipeById("r1");

    expect(row?.metadata.schema).toMatchObject({
      prepTime: "PT20M",
      cookTime: "PT35M",
      totalTime: "PT55M",
    });
  });

  it("drops a schema time key when its column is null", async () => {
    makeSupabaseMock({
      singleData: { ...structuredClone(staleBlobRow), cook_time: null },
    });

    const row = await getRecipeById("r1");

    // Deleted, not set to null: every downstream `if (schema.cookTime)` has to
    // see the same shape a recipe that never had a cook time produces.
    expect(row?.metadata.schema).not.toHaveProperty("cookTime");
    expect(row?.metadata.schema.prepTime).toBe("PT20M");
  });

  it("hydrates every row in a list query, not just single reads", async () => {
    makeSupabaseMock({ data: [structuredClone(staleBlobRow)], count: 1 });

    const { data } = await getRecipes();

    expect(data[0].metadata.schema.totalTime).toBe("PT55M");
  });

  it("writes times to columns and keeps them out of the blob on create", async () => {
    const { inserts } = makeWriteSupabaseMock({
      insertSingle: { data: { id: "x" }, error: null },
    });

    await createRecipeRow({
      url: "https://example.com",
      source: "example.com",
      schema: { name: "Enchiladas", prepTime: "PT20M", totalTime: "PT1H30M" },
    });

    expect(inserts[0]).toMatchObject({
      prep_time: 20,
      cook_time: null,
      total_time: 90,
    });
    const blob = (inserts[0].metadata as { schema: object }).schema;
    expect(blob).not.toHaveProperty("prepTime");
    expect(blob).not.toHaveProperty("totalTime");
  });

  it("still puts the times in the searchable markdown on create", async () => {
    const { inserts } = makeWriteSupabaseMock({
      insertSingle: { data: { id: "x" }, error: null },
    });

    await createRecipeRow({
      url: "https://example.com",
      source: "example.com",
      schema: { name: "Enchiladas", prepTime: "PT20M" },
    });

    // The columns are where times LAND; that is not a reason for the text that
    // gets embedded to stop mentioning them.
    expect(inserts[0].content).toContain("Prep: 20 min");
  });

  it("clears a column when the patch sends an explicit null", async () => {
    const { updates } = makeWriteSupabaseMock({
      selectSingle: { data: structuredClone(staleBlobRow), error: null },
      updateSingle: { data: structuredClone(staleBlobRow), error: null },
    });

    await updateRecipeRow("r1", { schema: { cookTime: null } });

    expect(updates[0]).toMatchObject({ cook_time: null });
  });

  it("leaves an untouched time at its column value, not the blob's", async () => {
    const { updates } = makeWriteSupabaseMock({
      selectSingle: { data: structuredClone(staleBlobRow), error: null },
      updateSingle: { data: structuredClone(staleBlobRow), error: null },
    });

    // A patch that says nothing about times — the blob's 999 must not win.
    await updateRecipeRow("r1", { schema: { description: "Fresh blurb" } });

    expect(updates[0]).toMatchObject({
      prep_time: 20,
      cook_time: 35,
      total_time: 55,
    });
  });

  it("never writes time keys back into the blob on update", async () => {
    const { updates } = makeWriteSupabaseMock({
      selectSingle: { data: structuredClone(staleBlobRow), error: null },
      updateSingle: { data: structuredClone(staleBlobRow), error: null },
    });

    await updateRecipeRow("r1", { schema: { prepTime: "PT45M" } });

    expect(updates[0]).toMatchObject({ prep_time: 45 });
    const blob = (updates[0].metadata as { schema: object }).schema;
    expect(blob).not.toHaveProperty("prepTime");
  });
});
