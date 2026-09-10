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
// trigger so repo tests never start detached LangGraph runs. The reconcile
// stays REAL — the should-normalize tests exercise the actual line-set
// comparison.
const mockScheduleNormalization = vi.hoisted(() => vi.fn());
// The recipe_ingredients side of a read or write goes through
// @/lib/ingredients on the admin client. Mocked at the module boundary: what
// these tests care about is that the repo layer asks for the rows, joins them,
// and writes them in the documented order — not how they're fetched.
const mockGetRecipeIngredients = vi.hoisted(() => vi.fn());
const mockGetRecipeIngredientsByRecipeIds = vi.hoisted(() => vi.fn());
const mockGetCatalogForRows = vi.hoisted(() => vi.fn());
const mockInsertRecipeIngredientRows = vi.hoisted(() => vi.fn());
const mockUpdateRecipeIngredientRows = vi.hoisted(() => vi.fn());
const mockDeleteRecipeIngredientRows = vi.hoisted(() => vi.fn());

vi.mock("@/lib/features", () => ({ getFeatures: () => mockFeatures }));
// importOriginal keeps toVectorLiteral real — the embedding tests assert the
// actual bracketed pgvector literal the write paths produce.
vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase")>();
  return { ...actual, getSupabaseClient: mockGetSupabaseClient };
});
vi.mock("@/lib/embedding", () => ({ generateEmbedding: mockGenerateEmbedding }));
vi.mock("@/lib/normalization/trigger", () => ({
  scheduleNormalization: mockScheduleNormalization,
}));
vi.mock("@/lib/ingredients", () => ({
  getRecipeIngredients: mockGetRecipeIngredients,
  getRecipeIngredientsByRecipeIds: mockGetRecipeIngredientsByRecipeIds,
  getCatalogForRows: mockGetCatalogForRows,
  insertRecipeIngredientRows: mockInsertRecipeIngredientRows,
  updateRecipeIngredientRows: mockUpdateRecipeIngredientRows,
  deleteRecipeIngredientRows: mockDeleteRecipeIngredientRows,
}));

import {
  createRecipeRow,
  getRecipes,
  getRecipeById,
  getStatusCounts,
  RecipeRepoError,
  updateRecipeRow,
} from "@/lib/recipes";
import { recipeToMarkdown } from "@/lib/format";
import { ingredientFixtures, makeRecipeIngredientRow } from "@/fixtures";

beforeEach(() => {
  mockGetRecipeIngredients.mockReset().mockResolvedValue([]);
  mockGetRecipeIngredientsByRecipeIds.mockReset().mockResolvedValue(new Map());
  mockGetCatalogForRows.mockReset().mockResolvedValue(new Map());
  mockInsertRecipeIngredientRows.mockReset().mockResolvedValue(undefined);
  mockUpdateRecipeIngredientRows.mockReset().mockResolvedValue(undefined);
  mockDeleteRecipeIngredientRows.mockReset().mockResolvedValue(undefined);
  mockScheduleNormalization.mockClear();
});

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
    const data = [{ id: "1", url: "u", source: "s", ingredients: [], metadata: { schema: { name: "Pasta" } } }];
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
    const nullStatusRecipe = { id: "99", url: "u", source: "s", status: null, ingredients: [], metadata: { schema: { name: "Test" } } };
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
    const recipe = { id: "42", url: "u", source: "s", ingredients: [], metadata: { schema: { name: "Pizza" } } };
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
      ingredients: [],
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
type SingleResult = { data: object | null; error: object | null };

function makeWriteSupabaseMock(opts: {
  selectSingle?: SingleResult;
  // A function sees the row being inserted, for tests that need the echo to
  // carry values the write path minted (ingredient row ids).
  insertSingle?: SingleResult | ((row: Record<string, unknown>) => SingleResult);
  updateSingle?: SingleResult;
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
        const result =
          typeof opts.insertSingle === "function"
            ? opts.insertSingle(row)
            : (opts.insertSingle ?? { data: null, error: null });
        return {
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue(result),
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
      ingredients: [],
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
      content: recipeToMarkdown(schema, []),
      url: "https://example.com",
      source: "example.com",
      status: "draft",
    });
  });

  it("includes the embedding as a pgvector literal when generation succeeds", async () => {
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    const { inserts } = makeWriteSupabaseMock({
      insertSingle: { data: { id: "x", ingredients: [] }, error: null },
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
      insertSingle: { data: { id: "x", ingredients: [] }, error: null },
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

  it("writes the lines as rows and names them in the column, then schedules normalization", async () => {
    const { inserts } = makeWriteSupabaseMock({
      // The database echoes the column it just stored.
      insertSingle: (row) => ({
        data: { id: "new-id", ingredients: row.ingredients },
        error: null,
      }),
    });

    const row = await createRecipeRow({
      id: "new-id",
      url: "https://example.com",
      source: "example.com",
      schema: { name: "Soup" },
      ingredients: [
        { name: "Broth", ingredients: [{ raw_text: "1 tsp cumin" }] },
        { ingredients: [{ raw_text: "2 cups rice" }] },
      ],
    });

    // The column names ids the reconcile minted, and the rows carry the same
    // ids — PostgREST does not promise insertion order back, so nothing here
    // waits for the database to assign them.
    const stored = inserts[0].ingredients as Array<{ name?: string; ingredients: string[] }>;
    expect(stored.map((g) => g.name)).toEqual(["Broth", undefined]);
    const [cuminId, riceId] = [stored[0].ingredients[0], stored[1].ingredients[0]];
    expect(mockInsertRecipeIngredientRows).toHaveBeenCalledWith([
      expect.objectContaining({ id: cuminId, recipe_id: "new-id", raw_text: "1 tsp cumin", quantity: 1, unit: "tsp" }),
      expect.objectContaining({ id: riceId, recipe_id: "new-id", raw_text: "2 cups rice" }),
    ]);
    // The searchable text lists the lines, group headings and all.
    expect(inserts[0].content).toContain("### Broth");
    expect(inserts[0].content).toContain("- 2 cups rice");
    // The recipe row lands before its ingredient rows (FK), and the returned
    // recipe is already hydrated from them.
    expect(row.ingredients[1].ingredients[0]).toMatchObject({ id: riceId, raw_text: "2 cups rice" });
    expect(mockScheduleNormalization).toHaveBeenCalledWith("new-id");
  });

  it("does not schedule normalization when there are no ingredients", async () => {
    makeWriteSupabaseMock({
      insertSingle: { data: { id: "new-id", ingredients: [] }, error: null },
    });

    await createRecipeRow({
      url: "https://example.com",
      source: "example.com",
      schema: { name: "Soup" },
    });

    expect(mockInsertRecipeIngredientRows).toHaveBeenCalledWith([]);
    expect(mockScheduleNormalization).not.toHaveBeenCalled();
  });

  it("strips a stray recipeIngredient key out of the blob", async () => {
    const { inserts } = makeWriteSupabaseMock({
      insertSingle: { data: { id: "x", ingredients: [] }, error: null },
    });

    await createRecipeRow({
      url: "https://example.com",
      source: "example.com",
      // The zod schema is passthrough, so an agent can still send the dead key.
      schema: { name: "Soup", recipeIngredient: ["1 tsp cumin"] } as never,
    });

    expect((inserts[0].metadata as { schema: object }).schema).not.toHaveProperty(
      "recipeIngredient",
    );
  });
});

describe("updateRecipeRow", () => {
  const existing = {
    id: "r1",
    url: "https://example.com",
    source: "example.com",
    status: "published",
    ingredients: [],
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
    expect(updates[0]).toMatchObject({ content: recipeToMarkdown(mergedSchema, []) });
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

  // ── Ingredients: the reconcile and the four-statement write ──────────────
  //
  // Normalization guesses associations for lines that lack them, so the only
  // thing that gives it work is a line appearing or disappearing. Every other
  // edit — reword, reorder, regroup — leaves the rows (and the curation on
  // them) where they are.

  const cuminRow = makeRecipeIngredientRow("r1", 0, {
    id: "ri-0",
    raw_text: "1 tsp cumin",
    quantity: 1,
    unit: "tsp",
    name_text: "cumin",
    ingredient_id: "ing-cumin",
    match_status: "manual",
  });
  const riceRow = makeRecipeIngredientRow("r1", 1, {
    id: "ri-1",
    raw_text: "2 cups rice",
    quantity: 2,
    unit: "cup",
    name_text: "rice",
  });
  const withLines = {
    ...existing,
    ingredients: [{ name: "Rub", ingredients: ["ri-0"] }, { ingredients: ["ri-1"] }],
  };

  function mockLines(rows = [cuminRow, riceRow]) {
    mockGetRecipeIngredients.mockResolvedValue(rows);
    return makeWriteSupabaseMock({
      selectSingle: { data: withLines, error: null },
      updateSingle: { data: withLines, error: null },
    });
  }

  it("leaves the rows alone when the patch omits ingredients", async () => {
    mockLines();

    await updateRecipeRow("r1", { schema: { description: "Fresh blurb" } });

    expect(mockInsertRecipeIngredientRows).not.toHaveBeenCalled();
    expect(mockUpdateRecipeIngredientRows).not.toHaveBeenCalled();
    expect(mockDeleteRecipeIngredientRows).not.toHaveBeenCalled();
    expect(mockScheduleNormalization).not.toHaveBeenCalled();
  });

  it("renders the current lines into the searchable text on a schema-only patch", async () => {
    const { updates } = mockLines();

    await updateRecipeRow("r1", { schema: { description: "Fresh blurb" } });

    expect(updates[0].content).toContain("### Rub");
    expect(updates[0].content).toContain("- 1 tsp cumin");
    expect(updates[0].content).toContain("- 2 cups rice");
  });

  it("rewords a line in place: re-parses its row, keeps its match, schedules nothing", async () => {
    const { updates } = mockLines();

    await updateRecipeRow("r1", {
      ingredients: [
        { name: "Rub", ingredients: [{ id: "ri-0", raw_text: "2 tsp ground cumin" }] },
        { ingredients: [{ id: "ri-1", raw_text: "2 cups rice" }] },
      ],
    });

    expect(mockUpdateRecipeIngredientRows).toHaveBeenCalledWith("r1", [
      expect.objectContaining({
        id: "ri-0",
        raw_text: "2 tsp ground cumin",
        quantity: 2,
        name_text: "ground cumin",
        ingredient_id: "ing-cumin",
        match_status: "manual",
      }),
    ]);
    expect(mockInsertRecipeIngredientRows).toHaveBeenCalledWith([]);
    expect(mockDeleteRecipeIngredientRows).toHaveBeenCalledWith("r1", []);
    expect(updates[0].ingredients).toEqual(withLines.ingredients);
    expect(updates[0].content).toContain("- 2 tsp ground cumin");
    expect(mockScheduleNormalization).not.toHaveBeenCalled();
  });

  it("reorders and regroups by rewriting the column alone", async () => {
    const { updates } = mockLines();

    await updateRecipeRow("r1", {
      ingredients: [
        { ingredients: [{ id: "ri-1", raw_text: "2 cups rice" }, { id: "ri-0", raw_text: "1 tsp cumin" }] },
      ],
    });

    expect(updates[0].ingredients).toEqual([{ ingredients: ["ri-1", "ri-0"] }]);
    expect(mockUpdateRecipeIngredientRows).toHaveBeenCalledWith("r1", []);
    expect(mockScheduleNormalization).not.toHaveBeenCalled();
  });

  it("adds a line: inserts its row, names it in the column, schedules normalization", async () => {
    const { updates } = mockLines();

    await updateRecipeRow("r1", {
      ingredients: [
        { name: "Rub", ingredients: [{ id: "ri-0", raw_text: "1 tsp cumin" }] },
        { ingredients: [{ id: "ri-1", raw_text: "2 cups rice" }, { raw_text: "1 tsp salt" }] },
      ],
    });

    const inserted = mockInsertRecipeIngredientRows.mock.calls[0][0];
    expect(inserted).toEqual([
      expect.objectContaining({ recipe_id: "r1", raw_text: "1 tsp salt", match_status: "unmatched" }),
    ]);
    expect(updates[0].ingredients).toEqual([
      { name: "Rub", ingredients: ["ri-0"] },
      { ingredients: ["ri-1", inserted[0].id] },
    ]);
    expect(mockScheduleNormalization).toHaveBeenCalledWith("r1");
  });

  it("removes a line: prunes its row after the recipe row lands, schedules normalization", async () => {
    const { client } = mockLines();

    await updateRecipeRow("r1", {
      ingredients: [{ name: "Rub", ingredients: [{ id: "ri-0", raw_text: "1 tsp cumin" }] }],
    });

    expect(mockDeleteRecipeIngredientRows).toHaveBeenCalledWith("r1", ["ri-1"]);
    // Order is load-bearing: rows in, THEN the recipe row (the commit point —
    // the column is the index), THEN the prune. A crash before the recipe row
    // leaves unreferenced rows; after it, orphans. Neither loses anything a
    // reader can see.
    const recipeUpdate = (
      client.from.mock.results[1].value as { update: ReturnType<typeof vi.fn> }
    ).update;
    expect(mockInsertRecipeIngredientRows.mock.invocationCallOrder[0]).toBeLessThan(
      recipeUpdate.mock.invocationCallOrder[0],
    );
    expect(mockUpdateRecipeIngredientRows.mock.invocationCallOrder[0]).toBeLessThan(
      recipeUpdate.mock.invocationCallOrder[0],
    );
    expect(mockDeleteRecipeIngredientRows.mock.invocationCallOrder[0]).toBeGreaterThan(
      recipeUpdate.mock.invocationCallOrder[0],
    );
    expect(mockScheduleNormalization).toHaveBeenCalledWith("r1");
  });

  // A prune failing after the save landed must not fail the save — the rows
  // are unreferenced either way.
  it("does not fail the save when the prune fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockLines();
    mockDeleteRecipeIngredientRows.mockRejectedValueOnce(new Error("boom"));

    await expect(
      updateRecipeRow("r1", {
        ingredients: [{ name: "Rub", ingredients: [{ id: "ri-0", raw_text: "1 tsp cumin" }] }],
      }),
    ).resolves.toBeDefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // A writer that carries no ids (a re-scrape, an agent posting bare text)
  // must not recreate every row: a line claims the row that says the same
  // thing, and the curation on it survives.
  it("carries an id-less line over to the row with the same text", async () => {
    const { updates } = mockLines();

    await updateRecipeRow("r1", {
      ingredients: [{ ingredients: [{ raw_text: "1 tsp cumin" }, { raw_text: "2 cups rice" }] }],
    });

    expect(mockInsertRecipeIngredientRows).toHaveBeenCalledWith([]);
    expect(mockDeleteRecipeIngredientRows).toHaveBeenCalledWith("r1", []);
    expect(updates[0].ingredients).toEqual([{ ingredients: ["ri-0", "ri-1"] }]);
    expect(mockScheduleNormalization).not.toHaveBeenCalled();
  });

  it("returns the recipe hydrated from the rows it just wrote, catalog attached", async () => {
    mockLines();
    mockGetCatalogForRows.mockResolvedValue(
      new Map([["ing-cumin", ingredientFixtures[0]]]),
    );

    const saved = await updateRecipeRow("r1", {
      ingredients: [
        { name: "Rub", ingredients: [{ id: "ri-0", raw_text: "2 tsp cumin" }] },
        { ingredients: [{ id: "ri-1", raw_text: "2 cups rice" }] },
      ],
    });

    expect(saved.ingredients[0].ingredients[0]).toMatchObject({
      id: "ri-0",
      raw_text: "2 tsp cumin",
      quantity: 2,
      ingredient_id: "ing-cumin",
    });
    expect(saved.ingredients[0].ingredients[0].ingredient).toBe(ingredientFixtures[0]);
  });

  it("never writes the dead recipeIngredient key back into the blob", async () => {
    const { updates } = makeWriteSupabaseMock({
      selectSingle: {
        data: {
          ...existing,
          metadata: { schema: { name: "Original", recipeIngredient: ["frozen"] } },
        },
        error: null,
      },
      updateSingle: { data: existing, error: null },
    });

    await updateRecipeRow("r1", {
      schema: { description: "Fresh blurb", recipeIngredient: ["stray"] } as never,
    });

    const blob = (updates[0].metadata as { schema: object }).schema;
    expect(blob).not.toHaveProperty("recipeIngredient");
    expect(blob).toMatchObject({ description: "Fresh blurb" });
  });
});

// ---------------------------------------------------------------------------
// The 0019 hydrate/extract seam. The columns are the source of truth; the
// metadata.schema copies are dead artifacts, and the repo layer is the only
// thing that knows it. Every test here fixes a way that could quietly stop
// being true — a missed read exit, or a write that repopulates the artifact.
// ---------------------------------------------------------------------------
describe("recipe time columns", () => {
  // The blob says 999 minutes; the columns say 20/35/55 minutes, in seconds.
  // A row shaped like this exists for real: the backfill copied the times
  // forward and then the user edited them, leaving the blob frozen at its
  // pre-0019 value.
  const staleBlobRow = {
    id: "r1",
    url: "https://example.com",
    source: "example.com",
    status: "published",
    prep_time: 1200,
    cook_time: 2100,
    total_time: 3300,
    ingredients: [],
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
      insertSingle: { data: { id: "x", ingredients: [] }, error: null },
    });

    await createRecipeRow({
      url: "https://example.com",
      source: "example.com",
      schema: { name: "Enchiladas", prepTime: "PT20M", totalTime: "PT1H30M" },
    });

    expect(inserts[0]).toMatchObject({
      prep_time: 1200,
      cook_time: null,
      total_time: 5400,
    });
    const blob = (inserts[0].metadata as { schema: object }).schema;
    expect(blob).not.toHaveProperty("prepTime");
    expect(blob).not.toHaveProperty("totalTime");
  });

  it("still puts the times in the searchable markdown on create", async () => {
    const { inserts } = makeWriteSupabaseMock({
      insertSingle: { data: { id: "x", ingredients: [] }, error: null },
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
      prep_time: 1200,
      cook_time: 2100,
      total_time: 3300,
    });
  });

  it("never writes time keys back into the blob on update", async () => {
    const { updates } = makeWriteSupabaseMock({
      selectSingle: { data: structuredClone(staleBlobRow), error: null },
      updateSingle: { data: structuredClone(staleBlobRow), error: null },
    });

    await updateRecipeRow("r1", { schema: { prepTime: "PT45M" } });

    expect(updates[0]).toMatchObject({ prep_time: 2700 });
    const blob = (updates[0].metadata as { schema: object }).schema;
    expect(blob).not.toHaveProperty("prepTime");
  });
});

// ---------------------------------------------------------------------------
// The 0016 ingredients seam. `recipes.ingredients` holds groups of row ids;
// the repo layer joins them to the recipe_ingredients rows at every read exit
// so everything above it sees RecipeIngredientGroup[].
// ---------------------------------------------------------------------------
describe("recipe ingredients hydration", () => {
  const cumin = ingredientFixtures[0];
  const storedRow = {
    id: "r1",
    url: "https://example.com",
    source: "example.com",
    status: "published",
    prep_time: null,
    cook_time: null,
    total_time: null,
    ingredients: [
      { name: "Rub", ingredients: ["ri-b", "ri-a"] },
      { ingredients: ["ri-c"] },
    ],
    metadata: { schema: { name: "Curry" } },
  };
  const rows = [
    makeRecipeIngredientRow("r1", 0, { id: "ri-a", raw_text: "1 tsp salt" }),
    makeRecipeIngredientRow("r1", 1, {
      id: "ri-b",
      raw_text: "2 tsp cumin seed",
      ingredient_id: cumin.id,
      match_status: "matched",
    }),
    makeRecipeIngredientRow("r1", 2, { id: "ri-c", raw_text: "2 cups rice" }),
  ];

  it("joins a single read to its rows AND the catalog, in column order", async () => {
    makeSupabaseMock({ singleData: structuredClone(storedRow) });
    mockGetRecipeIngredients.mockResolvedValue(rows);
    mockGetCatalogForRows.mockResolvedValue(new Map([[cumin.id, cumin]]));

    const recipe = await getRecipeById("r1");

    expect(mockGetRecipeIngredients).toHaveBeenCalledWith("r1");
    expect(mockGetCatalogForRows).toHaveBeenCalledWith(rows);
    expect(recipe?.ingredients).toHaveLength(2);
    expect(recipe?.ingredients[0].name).toBe("Rub");
    expect(recipe?.ingredients[0].ingredients.map((i) => i.raw_text)).toEqual([
      "2 tsp cumin seed",
      "1 tsp salt",
    ]);
    expect(recipe?.ingredients[0].ingredients[0].ingredient).toBe(cumin);
    expect(recipe?.ingredients[0].ingredients[1].ingredient).toBeNull();
    expect(recipe?.ingredients[1]).not.toHaveProperty("name");
    // The entity is the row minus what only the table cares about.
    expect(recipe?.ingredients[1].ingredients[0]).not.toHaveProperty("recipe_id");
  });

  it("joins a list read to its rows in one batch and skips the catalog", async () => {
    makeSupabaseMock({ data: [structuredClone(storedRow)], count: 1 });
    mockGetRecipeIngredientsByRecipeIds.mockResolvedValue(new Map([["r1", rows]]));

    const { data } = await getRecipes();

    expect(mockGetRecipeIngredientsByRecipeIds).toHaveBeenCalledWith(["r1"]);
    expect(mockGetCatalogForRows).not.toHaveBeenCalled();
    expect(data[0].ingredients[1].ingredients[0].raw_text).toBe("2 cups rice");
    // Not loaded, as opposed to unmatched — the key is absent, not null.
    expect(data[0].ingredients[0].ingredients[0]).not.toHaveProperty("ingredient");
  });

  // Card nutrition badges need each line's catalog row. One fetch covers the
  // page: a per-recipe one would be 24 round trips on a full listing.
  it("fetches the catalog once for the whole page when asked for it", async () => {
    const otherRow = { ...structuredClone(storedRow), id: "r2" };
    const r2Rows = [makeRecipeIngredientRow("r2", 0, { id: "ri-d" })];
    makeSupabaseMock({
      data: [structuredClone(storedRow), otherRow],
      count: 2,
    });
    mockGetRecipeIngredientsByRecipeIds.mockResolvedValue(
      new Map([
        ["r1", rows],
        ["r2", r2Rows],
      ]),
    );
    mockGetCatalogForRows.mockResolvedValue(new Map([[cumin.id, cumin]]));

    const { data } = await getRecipes({ catalog: true });

    expect(mockGetCatalogForRows).toHaveBeenCalledTimes(1);
    expect(mockGetCatalogForRows).toHaveBeenCalledWith([...rows, ...r2Rows]);
    expect(data[0].ingredients[0].ingredients[0].ingredient).toBe(cumin);
    // A line the catalog can't answer for is unmatched, not "not loaded".
    expect(data[0].ingredients[0].ingredients[1].ingredient).toBeNull();
  });

  it("deletes the blob's dead recipeIngredient key at the read exit", async () => {
    makeSupabaseMock({
      singleData: {
        ...structuredClone(storedRow),
        metadata: { schema: { name: "Curry", recipeIngredient: ["frozen copy"] } },
      },
    });
    mockGetRecipeIngredients.mockResolvedValue(rows);

    const recipe = await getRecipeById("r1");

    expect(recipe?.metadata.schema).not.toHaveProperty("recipeIngredient");
    expect(recipe?.ingredients[0].ingredients).toHaveLength(2);
  });

  it("renders a recipe short rather than failing when an id has no row", async () => {
    makeSupabaseMock({ singleData: structuredClone(storedRow) });
    mockGetRecipeIngredients.mockResolvedValue(rows.slice(0, 2));

    const recipe = await getRecipeById("r1");

    expect(recipe?.ingredients[1].ingredients).toEqual([]);
  });
});
