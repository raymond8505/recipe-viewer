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
// The recipe_ingredients table is a second repo module; mock it at the module
// boundary so these tests stay about the recipes row and the reconcile
// decisions, not about PostgREST. `getRecipeIngredients` is what supplies the
// rows a patch is diffed against.
const mockIngredientsRepo = vi.hoisted(() => ({
  getRecipeIngredients: vi.fn().mockResolvedValue([]),
  getRecipeIngredientsByRecipeIds: vi.fn().mockResolvedValue(new Map()),
  insertRecipeIngredientRows: vi.fn().mockResolvedValue(undefined),
  updateRecipeIngredientRows: vi.fn().mockResolvedValue(undefined),
  deleteRecipeIngredientRows: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/features", () => ({ getFeatures: () => mockFeatures }));
// importOriginal keeps toVectorLiteral real — the embedding tests assert the
// actual bracketed pgvector literal the write paths produce.
vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase")>();
  return { ...actual, getSupabaseClient: mockGetSupabaseClient };
});
vi.mock("@/lib/embedding", () => ({ generateEmbedding: mockGenerateEmbedding }));
vi.mock("@/lib/ingredients", () => mockIngredientsRepo);
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
import { makeRecipeIngredient } from "@/fixtures";
import type { RecipeIngredientRow } from "@/types/ingredient";

/** An existing persisted line: the row, plus the schema line that names it. */
function persistedLine(id: string, text: string, group?: string) {
  const row = makeRecipeIngredient("r1", 0, { id, raw_text: text });
  return {
    row,
    line: group == null ? { name: text, id } : { name: text, group, id },
  };
}

/** Point the mocked repo at a recipe's current rows. */
function withRows(rows: RecipeIngredientRow[]) {
  mockIngredientsRepo.getRecipeIngredients.mockResolvedValue(rows);
}

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

  it("returns data and count from supabase, with ingredient rows attached", async () => {
    const data = [
      {
        id: "1",
        url: "u",
        source: "s",
        ingredients: [],
        instructions: [],
        metadata: { schema: { name: "Pasta" } },
      },
    ];
    makeSupabaseMock({ data, count: 1 });

    const result = await getRecipes();
    expect(result.data).toEqual(data.map((row) => ({ ...row, ingredientRows: [] })));
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
  it("returns the recipe with its ingredient rows attached", async () => {
    const recipe = {
      id: "42",
      url: "u",
      source: "s",
      ingredients: [{ ingredients: ["ri-0"] }],
      instructions: [],
      metadata: { schema: { name: "Pizza" } },
    };
    const rows = [makeRecipeIngredient("42", 0, { id: "ri-0" })];
    withRows(rows);
    makeSupabaseMock({ singleData: recipe });

    const result = await getRecipeById("42");
    expect(result).toEqual({ ...recipe, ingredientRows: rows });
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

  // The read used to coerce a string `recipeInstructions` into an array on
  // every fetch. db/migrations/0016 moved instructions to a NOT NULL jsonb
  // column that the backfill normalized once, so there is nothing left to
  // coerce and the fix-up is gone.
  it("reads instructions straight off the column", async () => {
    const steps = [{ "@type": "HowToStep", text: "Boil water." }];
    makeSupabaseMock({
      singleData: {
        id: "99",
        url: "u",
        source: "s",
        ingredients: [],
        instructions: steps,
        metadata: { schema: { name: "Soup" } },
      },
    });

    const result = await getRecipeById("99");
    expect(result!.instructions).toEqual(steps);
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
    ingredients: [],
    instructions: [],
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

  // A caller may legitimately send bare strings — an MCP update_recipe, a
  // re-scrape. Each one has no row to claim, so it becomes a new row, and a new
  // row is exactly what normalization exists to guess an association for.
  it("creates a row for a line that arrives without an id", async () => {
    mockScheduleNormalization.mockClear();
    mockIngredientsRepo.insertRecipeIngredientRows.mockClear();
    withRows([]);
    makeWriteSupabaseMock({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", { schema: { recipeIngredient: ["2 tsp cumin"] } });

    expect(mockIngredientsRepo.insertRecipeIngredientRows).toHaveBeenCalledWith("r1", [
      expect.objectContaining({
        raw_text: "2 tsp cumin",
        quantity: 2,
        unit: "tsp",
        match_status: "unmatched",
        ingredient_id: null,
      }),
    ]);
    expect(mockScheduleNormalization).toHaveBeenCalledWith("r1");
  });

  it("writes the group array the reconcile produced", async () => {
    const cumin = persistedLine("ri-0", "1 tsp cumin");
    withRows([cumin.row]);
    const { updates } = makeWriteSupabaseMock({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", {
      schema: {
        recipeIngredient: [{ ...cumin.line, group: "Spices" }, "2 cups rice"],
      },
    });

    const groups = updates[0].ingredients as Array<{
      name?: string;
      ingredients: string[];
    }>;
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ name: "Spices", ingredients: ["ri-0"] });
    // The new line's id was minted before the write, so the group array can
    // reference it without waiting on the database.
    expect(groups[1].name).toBeUndefined();
    expect(groups[1].ingredients[0]).toEqual(expect.any(String));
    expect(groups[1].ingredients[0]).not.toBe("ri-0");
  });

  it("schedules normalization when a line is removed", async () => {
    mockScheduleNormalization.mockClear();
    mockIngredientsRepo.deleteRecipeIngredientRows.mockClear();
    const cumin = persistedLine("ri-0", "1 tsp cumin");
    const rice = persistedLine("ri-1", "2 cups rice");
    withRows([cumin.row, rice.row]);
    makeWriteSupabaseMock({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", { schema: { recipeIngredient: [cumin.line] } });

    expect(mockScheduleNormalization).toHaveBeenCalledWith("r1");
    expect(mockIngredientsRepo.deleteRecipeIngredientRows).toHaveBeenCalledWith("r1", [
      "ri-1",
    ]);
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

  // Regrouping moves a line between groups in the recipes array and touches
  // nothing else - the same row, the same words, the same association.
  it("does not schedule normalization or re-parse when a line is only regrouped", async () => {
    mockScheduleNormalization.mockClear();
    mockIngredientsRepo.updateRecipeIngredientRows.mockClear();
    const cumin = persistedLine("ri-0", "1 tsp cumin", "Spices");
    withRows([cumin.row]);
    makeWriteSupabaseMock({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", {
      schema: { recipeIngredient: [{ name: "1 tsp cumin", group: "Rubs", id: "ri-0" }] },
    });

    expect(mockScheduleNormalization).not.toHaveBeenCalled();
    expect(mockIngredientsRepo.updateRecipeIngredientRows).toHaveBeenCalledWith("r1", []);
  });

  // Normalization guesses associations for lines that lack them, so the only
  // thing that gives it work is a line appearing or disappearing. Rewording
  // gets a deterministic re-parse instead - re-running the matcher there would
  // overwrite the curator's own corrections.
  it("re-parses but does not re-normalize when a line is only reworded", async () => {
    mockScheduleNormalization.mockClear();
    mockIngredientsRepo.updateRecipeIngredientRows.mockClear();
    const cumin = persistedLine("ri-0", "1 tsp cumin");
    withRows([{ ...cumin.row, ingredient_id: "ing-cumin", match_status: "manual" }]);
    makeWriteSupabaseMock({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", {
      schema: { recipeIngredient: [{ name: "2 tsp ground cumin", id: "ri-0" }] },
    });

    expect(mockScheduleNormalization).not.toHaveBeenCalled();
    expect(mockIngredientsRepo.updateRecipeIngredientRows).toHaveBeenCalledWith("r1", [
      expect.objectContaining({
        id: "ri-0",
        raw_text: "2 tsp ground cumin",
        quantity: 2,
        // The curated association rides through the reword untouched - that is
        // the whole reason identity is the row and not the text.
        ingredient_id: "ing-cumin",
        match_status: "manual",
      }),
    ]);
  });

  it("schedules normalization when a line is added", async () => {
    mockScheduleNormalization.mockClear();
    const cumin = persistedLine("ri-0", "1 tsp cumin");
    withRows([cumin.row]);
    makeWriteSupabaseMock({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", {
      schema: { recipeIngredient: [cumin.line, "2 cups rice"] },
    });

    expect(mockScheduleNormalization).toHaveBeenCalledWith("r1");
  });

  it("keeps the row a patch hands back, and mints only for new lines", async () => {
    mockIngredientsRepo.insertRecipeIngredientRows.mockClear();
    const cumin = persistedLine("ri-0", "1 tsp cumin");
    withRows([cumin.row]);
    const { updates } = makeWriteSupabaseMock({
      selectSingle: { data: existing, error: null },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", {
      schema: {
        recipeIngredient: [{ name: "1 tsp ground cumin", id: "ri-0" }, "2 cups rice"],
      },
    });

    // The reworded line keeps its row - that row carries the association, so
    // replacing it would throw the curation away.
    const [inserted] = mockIngredientsRepo.insertRecipeIngredientRows.mock.calls[0][1];
    expect(inserted.raw_text).toBe("2 cups rice");
    expect(inserted.id).not.toBe("ri-0");

    const groups = updates[0].ingredients as Array<{ ingredients: string[] }>;
    expect(groups[0].ingredients).toEqual(["ri-0", inserted.id]);
  });
});
