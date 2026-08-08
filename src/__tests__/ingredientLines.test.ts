// @vitest-environment node
import { describe, expect, it } from "vitest";
import { lineId, lineSetChanged, withLineIds } from "@/lib/ingredientLines";

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

describe("lineSetChanged", () => {
  it("is false for a reword — a reword gives normalization nothing to do", () => {
    const before = [{ name: "1 tsp cumin", id: "L1" }];
    const after = [{ name: "1 tsp ground cumin, toasted", id: "L1" }];

    expect(lineSetChanged(before, after)).toBe(false);
  });

  it("is false for a reorder", () => {
    const before = [
      { name: "1 tsp cumin", id: "L1" },
      { name: "2 cups rice", id: "L2" },
    ];

    expect(lineSetChanged(before, [before[1], before[0]])).toBe(false);
  });

  it("is true when a line is added or removed", () => {
    const before = [{ name: "1 tsp cumin", id: "L1" }];

    expect(
      lineSetChanged(before, [...before, { name: "2 cups rice", id: "L2" }]),
    ).toBe(true);
    expect(lineSetChanged(before, [])).toBe(true);
  });

  // A recipe written before ids existed gets one minted per line on its first
  // save. Reading that as "every line is new" would re-run the matcher over a
  // recipe nobody restructured — and re-matching is precisely what a reword
  // must not cause.
  it("is false when a legacy line is only reworded and stamped with an id", () => {
    expect(
      lineSetChanged(["1 tsp cumin"], [{ name: "2 tsp cumin", id: "U1" }]),
    ).toBe(false);
  });

  it("is true when a legacy array gains a line", () => {
    expect(
      lineSetChanged(
        ["1 tsp cumin"],
        [
          { name: "1 tsp cumin", id: "U1" },
          { name: "2 cups rice", id: "U2" },
        ],
      ),
    ).toBe(true);
  });

  // Removal still has to be detected without ids: the orphaned row needs
  // pruning, and that is normalization's job.
  it("is true when a legacy array loses a line", () => {
    expect(
      lineSetChanged(
        ["1 tsp cumin", "2 cups rice"],
        [{ name: "1 tsp cumin", id: "U1" }],
      ),
    ).toBe(true);
  });

  it("is false for a mixed array where only the id-less line is stamped", () => {
    expect(
      lineSetChanged(
        [{ name: "1 tsp cumin", id: "L1" }, "2 cups rice"],
        [
          { name: "1 tsp cumin", id: "L1" },
          { name: "2 cups long-grain rice", id: "U2" },
        ],
      ),
    ).toBe(false);
  });
});

describe("lineId", () => {
  it("is null for a plain-string line", () => {
    expect(lineId("1 tsp cumin")).toBeNull();
    expect(lineId({ name: "1 tsp cumin" })).toBeNull();
    expect(lineId({ name: "1 tsp cumin", id: "L1" })).toBe("L1");
  });
});
