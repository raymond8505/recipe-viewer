// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";
import { createIngredient, updateIngredient } from "@/lib/api/ingredients";
import { makeIngredient } from "@/fixtures";

function mockFetchOnce(status: number, body: object) {
  const mock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// The routes answer a fixable body with prose naming the offender (a portion
// label given two weights). The form renders whatever this module throws, so
// swallowing that sentence in favour of the status code would put a number in
// front of a user looking at the mistake.
describe("ingredient writes surface an actionable 400", () => {
  const conflict =
    'food_portions gives "cup" more than one gramWeight. Each label may carry only one gramWeight.';

  it("throws the server's sentence when create is rejected", async () => {
    mockFetchOnce(400, { error: conflict });

    await expect(createIngredient({ name: "flour" } as never)).rejects.toThrow(
      conflict,
    );
  });

  it("throws the server's sentence when update is rejected", async () => {
    mockFetchOnce(400, { error: conflict });

    await expect(updateIngredient("ing-1", {})).rejects.toThrow(conflict);
  });

  it("falls back to the status when a 400 carries no sentence", async () => {
    mockFetchOnce(400, {});

    await expect(createIngredient({ name: "flour" } as never)).rejects.toThrow(
      /status 400/,
    );
  });

  // A 500 has nothing a user could act on, so it keeps the status line rather
  // than leaking whatever the server happened to say.
  it("keeps the status line for a server error", async () => {
    mockFetchOnce(500, { error: "Failed to save ingredient" });

    await expect(createIngredient({ name: "flour" } as never)).rejects.toThrow(
      /status 500/,
    );
  });

  it("still names a duplicate for 409", async () => {
    mockFetchOnce(409, { error: "whatever the server said" });

    await expect(createIngredient({ name: "flour" } as never)).rejects.toThrow(
      /already exists/,
    );
  });

  it("returns the row on success", async () => {
    const row = makeIngredient("ing-1", "flour");
    mockFetchOnce(201, row);

    await expect(createIngredient({ name: "flour" } as never)).resolves.toEqual(
      row,
    );
  });
});
