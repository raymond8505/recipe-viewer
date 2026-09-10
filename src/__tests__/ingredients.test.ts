// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IngredientRepoError,
  createIngredientRow,
  deleteIngredientRow,
  deleteRecipeIngredientRows,
  getCatalogForRows,
  getIngredientByFdcId,
  getIngredientById,
  getIngredients,
  getIngredientsByIds,
  getRecipeIngredientById,
  getRecipeIngredients,
  getRecipeIngredientsByRecipeIds,
  insertRecipeIngredientRows,
  matchIngredients,
  searchIngredientsKeyword,
  setRecipeIngredientGrams,
  updateRecipeIngredientAssociation,
  setRecipeNormalization,
  updateIngredientRow,
} from "@/lib/ingredients";
import { getSupabaseAdminClient, getSupabaseClient } from "@/lib/supabase";
import { makeSupabaseQueue } from "@/fixtures/supabase";
import { makeIngredient, makeRecipeIngredientRow } from "@/fixtures";

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
  // No ordering: `recipes.ingredients` says where each row goes, and `position`
  // is a dead column since db/migrations/0016.
  it("filters by recipe and leaves order to the recipe's group array", async () => {
    const rows = [makeRecipeIngredientRow("r-1", 0), makeRecipeIngredientRow("r-1", 1)];
    useQueue([{ data: rows }]);

    const result = await getRecipeIngredients("r-1");

    expect(result).toEqual(rows);
    const builder = builderAt(0);
    expect(builder.eq).toHaveBeenCalledWith("recipe_id", "r-1");
    expect(builder.order).not.toHaveBeenCalled();
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

describe("getRecipeIngredientsByRecipeIds", () => {
  it("buckets one batched query's rows by recipe", async () => {
    const a = makeRecipeIngredientRow("r-a", 0, { id: "ri-a" });
    const b = makeRecipeIngredientRow("r-b", 0, { id: "ri-b" });
    const a2 = makeRecipeIngredientRow("r-a", 1, { id: "ri-a2" });
    useQueue([{ data: [a, b, a2] }]);

    const result = await getRecipeIngredientsByRecipeIds(["r-a", "r-b", "r-none"]);

    expect(builderAt(0).in).toHaveBeenCalledWith("recipe_id", ["r-a", "r-b", "r-none"]);
    expect(result.get("r-a")).toEqual([a, a2]);
    expect(result.get("r-b")).toEqual([b]);
    expect(result.has("r-none")).toBe(false);
  });

  // The ids travel in the URL, which the gateway caps; one request per 100 keeps
  // a full recipe listing clear of the limit.
  it("splits a long id list into requests of 100", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `r-${i}`);
    useQueue([{ data: [] }, { data: [] }, { data: [] }]);

    await getRecipeIngredientsByRecipeIds(ids);

    expect(client.from).toHaveBeenCalledTimes(3);
    expect(builderAt(0).in).toHaveBeenCalledWith("recipe_id", ids.slice(0, 100));
    expect(builderAt(2).in).toHaveBeenCalledWith("recipe_id", ids.slice(200));
  });

  it("issues no query for no ids", async () => {
    useQueue([]);
    expect(await getRecipeIngredientsByRecipeIds([])).toEqual(new Map());
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns what it has on supabase error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useQueue([{ data: null, error: { message: "DB error" } }]);

    expect(await getRecipeIngredientsByRecipeIds(["r-a"])).toEqual(new Map());
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("getCatalogForRows", () => {
  it("fetches each distinct ingredient_id once and keys the result by id", async () => {
    const cumin = makeIngredient("ing-1", "cumin seed");
    useQueue([{ data: [cumin] }]);

    const result = await getCatalogForRows([
      makeRecipeIngredientRow("r-1", 0, { ingredient_id: "ing-1" }),
      makeRecipeIngredientRow("r-1", 1, { ingredient_id: "ing-1" }),
      makeRecipeIngredientRow("r-1", 2, { ingredient_id: null }),
    ]);

    expect(builderAt(0).in).toHaveBeenCalledWith("id", ["ing-1"]);
    expect(result.get("ing-1")).toBe(cumin);
  });

  it("skips the query when no row is matched", async () => {
    useQueue([]);
    expect(await getCatalogForRows([makeRecipeIngredientRow("r-1", 0)])).toEqual(new Map());
    expect(client.from).not.toHaveBeenCalled();
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

  // A whole list page's lines resolve here at once, so this list is as long as
  // the recipe-id one and travels in the same capped URL.
  it("splits a long id list into requests of 100 and concatenates them", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `ing-${i}`);
    const first = makeIngredient("ing-0", "cumin seed");
    const last = makeIngredient("ing-200", "coriander seed");
    useQueue([{ data: [first] }, { data: [] }, { data: [last] }]);

    expect(await getIngredientsByIds(ids)).toEqual([first, last]);
    expect(client.from).toHaveBeenCalledTimes(3);
    expect(builderAt(0).in).toHaveBeenCalledWith("id", ids.slice(0, 100));
    expect(builderAt(2).in).toHaveBeenCalledWith("id", ids.slice(200));
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

  // Callers join these rows onto lines by id, so half a catalog would read as
  // "some of these ingredients aren't in the catalog" rather than as an error.
  it("abandons the whole call when a later chunk errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ids = Array.from({ length: 150 }, (_, i) => `ing-${i}`);
    useQueue([
      { data: [makeIngredient("ing-0", "cumin seed")] },
      { data: null, error: { message: "DB error" } },
    ]);

    expect(await getIngredientsByIds(ids)).toEqual([]);
    errorSpy.mockRestore();
  });
});

describe("updateRecipeIngredientAssociation", () => {
  it("sets ingredient_id + manual status, nulls confidence, scoped to the recipe", async () => {
    const updated = {
      ...makeRecipeIngredientRow("r-1", 0),
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
    useQueue([{ data: makeRecipeIngredientRow("r-1", 0) }]);

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
    const row = makeRecipeIngredientRow("r-1", 0);
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
    const updated = makeRecipeIngredientRow("r-1", 0, {
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
    useQueue([{ data: makeRecipeIngredientRow("r-1", 0) }]);

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

describe("insertRecipeIngredientRows", () => {
  it("inserts the rows as given — ids included, since the recipe already names them", async () => {
    const rows = [makeRecipeIngredientRow("r-1", 0), makeRecipeIngredientRow("r-1", 1)];
    useQueue([{ error: null }]);

    await insertRecipeIngredientRows(rows);

    expect(builderAt(0).insert).toHaveBeenCalledWith(rows);
  });

  it("issues no query for no rows", async () => {
    useQueue([]);
    await insertRecipeIngredientRows([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("throws insert_failed when the insert fails", async () => {
    useQueue([{ error: { message: "boom" } }]);

    const err = await insertRecipeIngredientRows([makeRecipeIngredientRow("r-1", 0)]).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(IngredientRepoError);
    expect((err as IngredientRepoError).kind).toBe("insert_failed");
  });
});

describe("deleteRecipeIngredientRows", () => {
  it("deletes the named rows, scoped to the recipe", async () => {
    useQueue([{ error: null }]);

    await deleteRecipeIngredientRows("r-1", ["ri-a", "ri-b"]);

    const builder = builderAt(0);
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("recipe_id", "r-1");
    expect(builder.in).toHaveBeenCalledWith("id", ["ri-a", "ri-b"]);
  });

  it("issues no query for no ids", async () => {
    useQueue([]);
    await deleteRecipeIngredientRows("r-1", []);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("throws delete_failed when the delete fails", async () => {
    useQueue([{ error: { message: "boom" } }]);

    const err = await deleteRecipeIngredientRows("r-1", ["ri-a"]).catch((e: unknown) => e);

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
