// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IngredientRepoError,
  createIngredientRow,
  deleteIngredientRow,
  getIngredientById,
  getIngredients,
  getRecipeIngredients,
  matchIngredients,
  replaceRecipeIngredients,
  setRecipeNormalization,
  updateIngredientRow,
} from "@/lib/ingredients";
import { getSupabaseAdminClient, getSupabaseClient } from "@/lib/supabase";
import { makeSupabaseQueue } from "@/fixtures/supabase";
import { makeIngredient, makeRecipeIngredient } from "@/fixtures";

// Mock only the client getters; toVectorLiteral stays real so the bracketed
// pgvector literal assertions exercise the actual formatting.
vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase")>();
  return {
    ...actual,
    getSupabaseClient: vi.fn(),
    getSupabaseAdminClient: vi.fn(),
  };
});

type QueueClient = ReturnType<typeof makeSupabaseQueue>;
type QueueBuilder = Record<string, ReturnType<typeof vi.fn>>;

let client: QueueClient;

function useQueue(
  responses: Parameters<typeof makeSupabaseQueue>[0],
): QueueClient {
  client = makeSupabaseQueue(responses);
  vi.mocked(getSupabaseAdminClient).mockReturnValue(
    client as unknown as ReturnType<typeof getSupabaseAdminClient>,
  );
  return client;
}

function builderAt(n: number): QueueBuilder {
  return client.from.mock.results[n]?.value as QueueBuilder;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("client selection", () => {
  it("uses the service-role client, never the anon client", async () => {
    // ingredients/recipe_ingredients are RLS-locked with no policies — the
    // anon client would silently see nothing.
    useQueue([
      { data: makeIngredient("ing-1", "cumin seed") },
      { data: [], count: 0 },
    ]);

    await getIngredientById("ing-1");
    await getIngredients();

    expect(getSupabaseAdminClient).toHaveBeenCalledTimes(2);
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });
});

describe("getIngredients", () => {
  it("returns rows and count, sorted by name with a range window", async () => {
    const rows = [makeIngredient("ing-1", "cumin seed")];
    useQueue([{ data: rows, count: 41 }]);

    const result = await getIngredients({ page: 2, limit: 20 });

    expect(result).toEqual({ data: rows, count: 41 });
    expect(client.from).toHaveBeenCalledWith("ingredients");
    const builder = builderAt(0);
    expect(builder.select).toHaveBeenCalledWith(
      expect.stringContaining("density_g_per_ml"),
      { count: "exact" },
    );
    expect(builder.order).toHaveBeenCalledWith("name", { ascending: true });
    expect(builder.range).toHaveBeenCalledWith(20, 39);
  });

  it("applies an ilike name filter when a query is given", async () => {
    useQueue([{ data: [], count: 0 }]);

    await getIngredients({ query: "flour" });

    expect(builderAt(0).ilike).toHaveBeenCalledWith("name", "%flour%");
  });

  it("returns empty data and zero count on supabase error", async () => {
    useQueue([{ data: null, error: { message: "DB error" }, count: null }]);

    const result = await getIngredients();

    expect(result).toEqual({ data: [], count: 0 });
  });
});

describe("getIngredientById", () => {
  it("returns the row", async () => {
    const row = makeIngredient("ing-1", "cumin seed");
    useQueue([{ data: row }]);

    expect(await getIngredientById("ing-1")).toEqual(row);
    expect(builderAt(0).eq).toHaveBeenCalledWith("id", "ing-1");
  });

  it("returns null on error", async () => {
    useQueue([{ data: null, error: { message: "missing" } }]);

    expect(await getIngredientById("nope")).toBeNull();
  });
});

describe("createIngredientRow", () => {
  it("inserts with a bracketed pgvector literal and defaults source to usda", async () => {
    const row = makeIngredient("ing-1", "cumin seed");
    useQueue([{ data: row }]);

    const result = await createIngredientRow({
      name: "cumin seed",
      embedding: [0.1, 0.2, 0.3],
    });

    expect(result).toEqual(row);
    expect(builderAt(0).insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "cumin seed",
        source: "usda",
        embedding: "[0.1,0.2,0.3]",
      }),
    );
  });

  it("omits the embedding column when no embedding is provided", async () => {
    useQueue([{ data: makeIngredient("ing-1", "cumin seed") }]);

    await createIngredientRow({ name: "cumin seed" });

    const inserted = builderAt(0).insert.mock.calls[0][0] as object;
    expect(inserted).not.toHaveProperty("embedding");
  });

  it("throws conflict on a unique-violation (23505)", async () => {
    useQueue([{ data: null, error: { message: "dup", code: "23505" } }]);

    const err = await createIngredientRow({ name: "cumin seed" }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("conflict");
  });

  it("throws insert_failed on any other supabase failure", async () => {
    useQueue([{ data: null, error: { message: "RLS violation" } }]);

    const err = await createIngredientRow({ name: "cumin seed" }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("insert_failed");
  });
});

describe("updateIngredientRow", () => {
  it("throws not_found when the row does not exist", async () => {
    useQueue([{ data: null, error: { message: "0 rows" } }]);

    const err = await updateIngredientRow("nope", { name: "x" }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("not_found");
  });

  it("writes the patch with updated_at and a vector literal", async () => {
    const row = makeIngredient("ing-1", "cumin");
    useQueue([{ data: { id: "ing-1" } }, { data: row }]);

    const result = await updateIngredientRow("ing-1", {
      name: "cumin",
      embedding: [1, 2],
    });

    expect(result).toEqual(row);
    expect(builderAt(1).update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "cumin",
        embedding: "[1,2]",
        updated_at: expect.any(String),
      }),
    );
  });

  it("returns the current row without writing when the patch is empty", async () => {
    const row = makeIngredient("ing-1", "cumin seed");
    useQueue([{ data: { id: "ing-1" } }, { data: row }]);

    const result = await updateIngredientRow("ing-1", {});

    expect(result).toEqual(row);
    expect(builderAt(0).update).not.toHaveBeenCalled();
    expect(builderAt(1).update).not.toHaveBeenCalled();
  });

  it("throws conflict when the rename collides (23505)", async () => {
    useQueue([
      { data: { id: "ing-1" } },
      { data: null, error: { message: "dup", code: "23505" } },
    ]);

    const err = await updateIngredientRow("ing-1", { name: "taken" }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("conflict");
  });

  it("throws update_failed on any other supabase failure", async () => {
    useQueue([
      { data: { id: "ing-1" } },
      { data: null, error: { message: "boom" } },
    ]);

    const err = await updateIngredientRow("ing-1", { name: "x" }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("update_failed");
  });
});

describe("deleteIngredientRow", () => {
  it("throws not_found when the row does not exist", async () => {
    useQueue([{ data: null, error: { message: "0 rows" } }]);

    const err = await deleteIngredientRow("nope").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("not_found");
  });

  it("deletes by id", async () => {
    useQueue([{ data: { id: "ing-1" } }, { error: null }]);

    await deleteIngredientRow("ing-1");

    const builder = builderAt(1);
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("id", "ing-1");
  });

  it("throws delete_failed on supabase failure", async () => {
    useQueue([{ data: { id: "ing-1" } }, { error: { message: "boom" } }]);

    const err = await deleteIngredientRow("ing-1").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("delete_failed");
  });
});

describe("matchIngredients", () => {
  it("invokes the RPC with a bracketed literal and passes params through", async () => {
    const matches = [
      { id: "ing-1", name: "cumin seed", nutrition: null, density_g_per_ml: null, similarity: 0.91 },
    ];
    useQueue([{ data: matches }]);

    const result = await matchIngredients([0.5, 0.25], 3, 0.6);

    expect(result).toEqual(matches);
    expect(client.rpc).toHaveBeenCalledWith("match_ingredients", {
      query_embedding: "[0.5,0.25]",
      match_count: 3,
      min_similarity: 0.6,
    });
  });

  it("defaults to top-5 with no similarity floor", async () => {
    useQueue([{ data: [] }]);

    await matchIngredients([1]);

    expect(client.rpc).toHaveBeenCalledWith("match_ingredients", {
      query_embedding: "[1]",
      match_count: 5,
      min_similarity: 0,
    });
  });

  it("throws match_failed on RPC error — callers must not read that as 'no matches'", async () => {
    useQueue([{ data: null, error: { message: "function missing" } }]);

    const err = await matchIngredients([1]).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("match_failed");
  });
});

describe("getRecipeIngredients", () => {
  it("filters by recipe and orders by position", async () => {
    const rows = [makeRecipeIngredient("r-1", 0), makeRecipeIngredient("r-1", 1)];
    useQueue([{ data: rows }]);

    const result = await getRecipeIngredients("r-1");

    expect(result).toEqual(rows);
    const builder = builderAt(0);
    expect(builder.eq).toHaveBeenCalledWith("recipe_id", "r-1");
    expect(builder.order).toHaveBeenCalledWith("position", { ascending: true });
  });

  it("returns an empty array on supabase error", async () => {
    useQueue([{ data: null, error: { message: "DB error" } }]);

    expect(await getRecipeIngredients("r-1")).toEqual([]);
  });
});

describe("replaceRecipeIngredients", () => {
  const insertRow = {
    ingredient_id: null,
    raw_text: "1 tsp cumin",
    quantity: 1,
    unit: "tsp",
    name_text: "cumin",
    note: null,
    match_status: "unmatched" as const,
    confidence: null,
    position: 0,
  };

  it("deletes the recipe's rows before inserting the new set", async () => {
    useQueue([{ error: null }, { error: null }]);

    await replaceRecipeIngredients("r-1", [insertRow]);

    expect(client.from).toHaveBeenCalledTimes(2);
    const deleter = builderAt(0);
    expect(deleter.delete).toHaveBeenCalled();
    expect(deleter.eq).toHaveBeenCalledWith("recipe_id", "r-1");
    expect(builderAt(1).insert).toHaveBeenCalledWith([
      { ...insertRow, recipe_id: "r-1" },
    ]);
  });

  it("skips the insert entirely for an empty row set", async () => {
    useQueue([{ error: null }]);

    await replaceRecipeIngredients("r-1", []);

    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("throws delete_failed when the delete fails", async () => {
    useQueue([{ error: { message: "boom" } }]);

    const err = await replaceRecipeIngredients("r-1", [insertRow]).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("delete_failed");
  });

  it("throws insert_failed when the insert fails", async () => {
    useQueue([{ error: null }, { error: { message: "boom" } }]);

    const err = await replaceRecipeIngredients("r-1", [insertRow]).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("insert_failed");
  });
});

describe("setRecipeNormalization", () => {
  it("writes only the provided normalization columns", async () => {
    useQueue([{ error: null }]);

    await setRecipeNormalization("r-1", { status: "failed", error: "boom" });

    expect(client.from).toHaveBeenCalledWith("recipes");
    const written = builderAt(0).update.mock.calls[0][0] as object;
    expect(written).toEqual({
      normalization_status: "failed",
      normalization_error: "boom",
    });
  });

  it("maps normalizedAt and fingerprint to their columns", async () => {
    useQueue([{ error: null }]);

    await setRecipeNormalization("r-1", {
      status: "completed",
      error: null,
      normalizedAt: "2026-07-14T00:00:00.000Z",
      fingerprint: "abc123",
    });

    expect(builderAt(0).update).toHaveBeenCalledWith({
      normalization_status: "completed",
      normalization_error: null,
      ingredients_normalized_at: "2026-07-14T00:00:00.000Z",
      normalized_fingerprint: "abc123",
    });
  });

  it("throws update_failed on supabase failure", async () => {
    useQueue([{ error: { message: "boom" } }]);

    const err = await setRecipeNormalization("r-1", {
      status: "pending",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("update_failed");
  });
});
