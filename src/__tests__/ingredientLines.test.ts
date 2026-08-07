// @vitest-environment node
import { describe, expect, it } from "vitest";
import { lineId, lineIdSetKey, withLineIds } from "@/lib/ingredientLines";

describe("withLineIds", () => {
  it("mints an id for every line and converts strings to objects", () => {
    const out = withLineIds(["1 tsp cumin", "2 cups rice"]);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "1 tsp cumin" });
    expect(out[1]).toMatchObject({ name: "2 cups rice" });
    expect(out[0].id).toEqual(expect.any(String));
    expect(out[1].id).not.toBe(out[0].id);
  });

  it("keeps an id the caller supplied, whatever the text now says", () => {
    // The whole point: a client that read the recipe and reworded a line hands
    // the id back, and the derived row (plus any curated association) stays
    // attached to it.
    const out = withLineIds([{ name: "1 tsp ground cumin", id: "L1" }]);

    expect(out[0]).toEqual({ name: "1 tsp ground cumin", id: "L1" });
  });

  it("preserves group alongside the id", () => {
    const out = withLineIds([{ name: "1 tsp cumin", group: "Spices", id: "L1" }]);

    expect(out[0]).toEqual({ name: "1 tsp cumin", group: "Spices", id: "L1" });
  });

  it("carries an id over by text for a caller that sends bare strings", () => {
    // An agent or scrape that doesn't know about ids would otherwise re-key
    // every row on every save. Text matching is the shim for exactly that.
    const current = [
      { name: "1 tsp cumin", id: "L1" },
      { name: "2 cups rice", id: "L2" },
    ];

    const out = withLineIds(["2 cups rice", "1 tsp cumin"], current);

    expect(out[0]).toMatchObject({ name: "2 cups rice", id: "L2" });
    expect(out[1]).toMatchObject({ name: "1 tsp cumin", id: "L1" });
  });

  it("gives duplicate lines distinct ids rather than sharing one", () => {
    // (recipe_id, line_id) is unique — two lines inheriting the same id would
    // collide on insert and lose a row.
    const current = [
      { name: "1 tbsp oil", id: "L1" },
      { name: "1 tbsp oil", id: "L2" },
    ];

    const out = withLineIds(["1 tbsp oil", "1 tbsp oil"], current);

    expect(out[0].id).toBe("L1");
    expect(out[1].id).toBe("L2");
  });

  it("does not reuse an id that another line already claims", () => {
    const current = [{ name: "1 tsp cumin", id: "L1" }];

    // The first line explicitly claims L1; the second must not inherit it too.
    const out = withLineIds([{ name: "totally new", id: "L1" }, "1 tsp cumin"], current);

    expect(out[0].id).toBe("L1");
    expect(out[1].id).not.toBe("L1");
    expect(out[1].id).toEqual(expect.any(String));
  });

  it("mints for a genuinely new line rather than stealing a removed line's id", () => {
    const current = [{ name: "1 tsp cumin", id: "L1" }];

    const out = withLineIds(["3 cloves garlic"], current);

    expect(out[0].id).not.toBe("L1");
  });
});

describe("lineIdSetKey", () => {
  it("is unchanged by rewording — a reword gives normalization nothing to do", () => {
    const before = [{ name: "1 tsp cumin", id: "L1" }];
    const after = [{ name: "1 tsp ground cumin, toasted", id: "L1" }];

    expect(lineIdSetKey(after)).toBe(lineIdSetKey(before));
  });

  it("is unchanged by reordering", () => {
    const before = [
      { name: "1 tsp cumin", id: "L1" },
      { name: "2 cups rice", id: "L2" },
    ];

    expect(lineIdSetKey([before[1], before[0]])).toBe(lineIdSetKey(before));
  });

  it("changes when a line is added or removed", () => {
    const before = [{ name: "1 tsp cumin", id: "L1" }];
    const added = [...before, { name: "2 cups rice", id: "L2" }];

    expect(lineIdSetKey(added)).not.toBe(lineIdSetKey(before));
    expect(lineIdSetKey([])).not.toBe(lineIdSetKey(before));
  });
});

describe("lineId", () => {
  it("is null for a plain-string line", () => {
    expect(lineId("1 tsp cumin")).toBeNull();
    expect(lineId({ name: "1 tsp cumin" })).toBeNull();
    expect(lineId({ name: "1 tsp cumin", id: "L1" })).toBe("L1");
  });
});
