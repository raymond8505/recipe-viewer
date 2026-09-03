// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IngredientRepoError,
  createIngredientRow,
  deleteIngredientRow,
  getIngredientByFdcId,
  getIngredientById,
  getIngredients,
  getIngredientsByIds,
  getRecipeIngredientById,
  getRecipeIngredients,
  matchIngredients,
  replaceRecipeIngredients,
  searchIngredientsKeyword,
  setRecipeIngredientGrams,
  updateRecipeIngredientAssociation,
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
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useQueue([{ data: null, error: { message: "DB error" }, count: null }]);

    const result = await getIngredients();

    expect(result).toEqual({ data: [], count: 0 });
    expect(errorSpy).toHaveBeenCalledWith(
      "Supabase error fetching ingredients:",
      expect.anything(),
    );
    errorSpy.mockRestore();
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

describe("getIngredientByFdcId", () => {
  it("returns the first row holding the fdc_id", async () => {
    const row = makeIngredient("ing-1", "cumin seed", { fdc_id: 170923 });
    useQueue([{ data: [row] }]);

    expect(await getIngredientByFdcId(170923)).toEqual(row);
    expect(builderAt(0).eq).toHaveBeenCalledWith("fdc_id", 170923);
    expect(builderAt(0).limit).toHaveBeenCalledWith(1);
  });

  it("returns null when no row holds the fdc_id", async () => {
    useQueue([{ data: [] }]);

    expect(await getIngredientByFdcId(999999)).toBeNull();
  });

  it("returns null on error", async () => {
    useQueue([{ data: null, error: { message: "boom" } }]);

    expect(await getIngredientByFdcId(170923)).toBeNull();
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

  it("throws conflict on a unique-violation (23505)", async () => {
    useQueue([{ data: null, error: { message: "dup", code: "23505" } }]);

    const err = await createIngredientRow({
      name: "cumin seed",
      embedding: [0.1],
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("conflict");
  });

  it("throws insert_failed on any other supabase failure", async () => {
    useQueue([{ data: null, error: { message: "RLS violation" } }]);

    const err = await createIngredientRow({
      name: "cumin seed",
      embedding: [0.1],
    }).catch((e: unknown) => e);

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
  it("invokes the hybrid RPC with the query text and a bracketed literal", async () => {
    const matches = [
      {
        id: "ing-1",
        name: "Spices, cumin seed",
        // Returned as of db/migrations/0012 — keyword_similarity is a best-of
        // over name AND aliases, so withholding them handed callers a score
        // derived from data they couldn't see.
        aliases: ["cumin seed", "whole cumin"],
        nutrition: null,
        density_g_per_ml: null,
        semantic_similarity: 0.91,
        keyword_similarity: 1,
        score: 0.039,
      },
    ];
    useQueue([{ data: matches }]);

    const result = await matchIngredients("cumin seed", [0.5, 0.25], 3);

    expect(result).toEqual(matches);
    expect(result[0].aliases).toEqual(["cumin seed", "whole cumin"]);
    expect(client.rpc).toHaveBeenCalledWith("match_ingredients", {
      query_text: "cumin seed",
      query_embedding: "[0.5,0.25]",
      match_count: 3,
    });
  });

  it("defaults to top-5", async () => {
    useQueue([{ data: [] }]);

    await matchIngredients("cumin", [1]);

    expect(client.rpc).toHaveBeenCalledWith("match_ingredients", {
      query_text: "cumin",
      query_embedding: "[1]",
      match_count: 5,
    });
  });

  it("throws match_failed on RPC error — callers must not read that as 'no matches'", async () => {
    useQueue([{ data: null, error: { message: "function missing" } }]);

    const err = await matchIngredients("cumin", [1]).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("match_failed");
  });
});

describe("searchIngredientsKeyword", () => {
  it("invokes the keyword RPC with the query text and count", async () => {
    const matches = [
      {
        id: "ing-1",
        name: "cumin seed",
        aliases: ["cumin"],
        nutrition: null,
        density_g_per_ml: null,
        similarity: 0.87,
      },
    ];
    useQueue([{ data: matches }]);

    const result = await searchIngredientsKeyword("cumin sed", 3);

    expect(result).toEqual(matches);
    expect(client.rpc).toHaveBeenCalledWith("search_ingredients_keyword", {
      query_text: "cumin sed",
      match_count: 3,
    });
  });

  it("defaults to top-8", async () => {
    useQueue([{ data: [] }]);

    await searchIngredientsKeyword("cumin");

    expect(client.rpc).toHaveBeenCalledWith("search_ingredients_keyword", {
      query_text: "cumin",
      match_count: 8,
    });
  });

  it("throws match_failed on RPC error — callers must not read that as 'no matches'", async () => {
    useQueue([{ data: null, error: { message: "function missing" } }]);

    const err = await searchIngredientsKeyword("cumin").catch((e: unknown) => e);

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
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useQueue([{ data: null, error: { message: "DB error" } }]);

    expect(await getRecipeIngredients("r-1")).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      "Supabase error fetching recipe ingredients:",
      expect.anything(),
    );
    errorSpy.mockRestore();
  });
});

describe("getIngredientsByIds", () => {
  it("fetches catalog rows with an .in filter", async () => {
    const rows = [makeIngredient("ing-1", "cumin seed")];
    useQueue([{ data: rows }]);

    const result = await getIngredientsByIds(["ing-1", "ing-2"]);

    expect(result).toEqual(rows);
    const builder = builderAt(0);
    expect(builder.in).toHaveBeenCalledWith("id", ["ing-1", "ing-2"]);
  });

  it("short-circuits to [] on empty ids without touching supabase", async () => {
    useQueue([]);

    expect(await getIngredientsByIds([])).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns an empty array on supabase error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useQueue([{ data: null, error: { message: "DB error" } }]);

    expect(await getIngredientsByIds(["ing-1"])).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      "Supabase error fetching ingredients by ids:",
      expect.anything(),
    );
    errorSpy.mockRestore();
  });
});

describe("updateRecipeIngredientAssociation", () => {
  it("sets ingredient_id + manual status, nulls confidence, scoped to the recipe", async () => {
    const updated = {
      ...makeRecipeIngredient("r-1", 0),
      ingredient_id: "ing-2",
      match_status: "manual",
      confidence: null,
    };
    useQueue([{ data: updated }]);

    const result = await updateRecipeIngredientAssociation("r-1", "ri-1", "ing-2");

    expect(result).toEqual(updated);
    expect(client.from).toHaveBeenCalledWith("recipe_ingredients");
    const builder = builderAt(0);
    expect(builder.update).toHaveBeenCalledWith({
      ingredient_id: "ing-2",
      match_status: "manual",
      confidence: null,
    });
    expect(builder.eq).toHaveBeenCalledWith("id", "ri-1");
    expect(builder.eq).toHaveBeenCalledWith("recipe_id", "r-1");
  });

  it("clearing the association marks the line unmatched", async () => {
    useQueue([{ data: makeRecipeIngredient("r-1", 0) }]);

    await updateRecipeIngredientAssociation("r-1", "ri-1", null);

    const builder = builderAt(0);
    expect(builder.update).toHaveBeenCalledWith({
      ingredient_id: null,
      match_status: "unmatched",
      confidence: null,
    });
  });

  it("throws not_found when the row doesn't exist under the recipe (PGRST116)", async () => {
    useQueue([{ data: null, error: { message: "0 rows", code: "PGRST116" } }]);

    const err = await updateRecipeIngredientAssociation("r-1", "ri-x", "ing-1").catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("not_found");
  });

  it("throws not_found when the target ingredient vanished (FK 23503)", async () => {
    useQueue([{ data: null, error: { message: "fk violation", code: "23503" } }]);

    const err = await updateRecipeIngredientAssociation("r-1", "ri-1", "ing-gone").catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("not_found");
  });

  it("throws update_failed on any other supabase error", async () => {
    useQueue([{ data: null, error: { message: "boom", code: "XX000" } }]);

    const err = await updateRecipeIngredientAssociation("r-1", "ri-1", "ing-1").catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("update_failed");
  });
});

describe("getRecipeIngredientById", () => {
  it("fetches one row scoped to the recipe", async () => {
    const row = makeRecipeIngredient("r-1", 0);
    useQueue([{ data: row }]);

    const result = await getRecipeIngredientById("r-1", "ri-1");

    expect(result).toEqual(row);
    const builder = builderAt(0);
    expect(builder.eq).toHaveBeenCalledWith("id", "ri-1");
    expect(builder.eq).toHaveBeenCalledWith("recipe_id", "r-1");
  });

  it("returns null when the row doesn't exist under the recipe", async () => {
    useQueue([{ data: null, error: { message: "0 rows", code: "PGRST116" } }]);

    expect(await getRecipeIngredientById("r-1", "ri-x")).toBeNull();
  });
});

describe("setRecipeIngredientGrams", () => {
  it("stores grams + source, scoped to the recipe", async () => {
    const updated = makeRecipeIngredient("r-1", 0, {
      estimated_grams: 26,
      grams_source: "llm",
    });
    useQueue([{ data: updated }]);

    const result = await setRecipeIngredientGrams("r-1", "ri-1", 26, "llm");

    expect(result).toEqual(updated);
    const builder = builderAt(0);
    expect(builder.update).toHaveBeenCalledWith({
      estimated_grams: 26,
      grams_source: "llm",
    });
    expect(builder.eq).toHaveBeenCalledWith("id", "ri-1");
    expect(builder.eq).toHaveBeenCalledWith("recipe_id", "r-1");
  });

  it("clearing with null forces grams_source null regardless of the arg", async () => {
    useQueue([{ data: makeRecipeIngredient("r-1", 0) }]);

    await setRecipeIngredientGrams("r-1", "ri-1", null, "manual");

    expect(builderAt(0).update).toHaveBeenCalledWith({
      estimated_grams: null,
      grams_source: null,
    });
  });

  it("throws not_found when the row doesn't exist under the recipe (PGRST116)", async () => {
    useQueue([{ data: null, error: { message: "0 rows", code: "PGRST116" } }]);

    const err = await setRecipeIngredientGrams("r-1", "ri-x", 26, "llm").catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("not_found");
  });

  it("throws update_failed on any other supabase error", async () => {
    useQueue([{ data: null, error: { message: "boom", code: "XX000" } }]);

    const err = await setRecipeIngredientGrams("r-1", "ri-1", 26, "llm").catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("update_failed");
  });
});

describe("replaceRecipeIngredients", () => {
  const insertRow = {
    id: "ri-1",
    ingredient_id: null,
    raw_text: "1 tsp cumin",
    quantity: 1,
    unit: "tsp",
    name_text: "cumin",
    note: null,
    match_status: "unmatched" as const,
    confidence: null,
    estimated_grams: null,
    grams_source: null,
  };

  it("upserts on the primary key, then prunes what it no longer names", async () => {
    useQueue([{ error: null }, { error: null }]);

    await replaceRecipeIngredients("r-1", [insertRow]);

    expect(client.from).toHaveBeenCalledTimes(2);
    // Upsert, not delete-then-insert: a surviving line keeps its row, and the
    // UI PATCHes associations by row id. Under delete-then-insert a run
    // completing between page load and a click left the client holding an id
    // that no longer existed.
    expect(builderAt(0).upsert).toHaveBeenCalledWith([
      { ...insertRow, recipe_id: "r-1" },
    ]);
    const pruner = builderAt(1);
    expect(pruner.delete).toHaveBeenCalled();
    expect(pruner.eq).toHaveBeenCalledWith("recipe_id", "r-1");
    expect(pruner.not).toHaveBeenCalledWith("id", "in", '("ri-1")');
  });

  // The upsert lands first so a failure between the two leaves unreferenced
  // rows rather than missing ones — nothing a reader can see either way.
  it("prunes every row when the new set is empty", async () => {
    useQueue([{ error: null }]);

    await replaceRecipeIngredients("r-1", []);

    expect(client.from).toHaveBeenCalledTimes(1);
    expect(builderAt(0).delete).toHaveBeenCalled();
    expect(builderAt(0).not).not.toHaveBeenCalled();
  });

  it("throws insert_failed when the upsert fails", async () => {
    useQueue([{ error: { message: "boom" } }]);

    const err = await replaceRecipeIngredients("r-1", [insertRow]).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("insert_failed");
  });

  it("throws delete_failed when the prune fails", async () => {
    useQueue([{ error: null }, { error: { message: "boom" } }]);

    const err = await replaceRecipeIngredients("r-1", [insertRow]).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("delete_failed");
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
