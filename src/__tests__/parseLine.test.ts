// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseLineDeterministic } from "@/lib/normalization/parseLine";

describe("parseLineDeterministic", () => {
  it("splits an ordinary line into amount, unit and name", () => {
    expect(parseLineDeterministic("2 cups flour", 0)).toEqual({
      position: 0,
      rawText: "2 cups flour",
      quantity: 2,
      unit: "cup",
      name: "flour",
      note: null,
    });
  });

  it("takes the midpoint of a range, as the column stores one number", () => {
    const parsed = parseLineDeterministic("1-2 cups flour", 3);
    expect(parsed.quantity).toBe(1.5);
    expect(parsed.position).toBe(3);
  });

  it("keeps the whole line as the name when there is no amount to find", () => {
    expect(parseLineDeterministic("Salt and pepper", 0)).toMatchObject({
      quantity: null,
      unit: null,
      name: "salt and pepper",
    });
  });
});

describe("parseLineDeterministic — a dimension", () => {
  // A size is a unit, and the object it sizes is not part of the food: the
  // catalog holds "ginger", so a name of "piece ginger" matches nothing.
  it("reads the size as the unit and the food as the name", () => {
    for (const line of [
      "1-inch piece ginger",
      "1 inch piece ginger",
      "1-inch piece of ginger",
      "1-inch knob of ginger",
      "1 inch of ginger",
      '1" piece ginger',
    ]) {
      expect(parseLineDeterministic(line, 0), line).toMatchObject({
        quantity: 1,
        unit: "inch",
        name: "ginger",
      });
    }
  });

  it("reads metric dimensions too", () => {
    expect(parseLineDeterministic("3 cm knob of ginger", 0)).toMatchObject({
      quantity: 3,
      unit: "cm",
      name: "ginger",
    });
    expect(parseLineDeterministic("4-mm slice of ginger", 0)).toMatchObject({
      quantity: 4,
      unit: "mm",
      name: "ginger",
    });
  });

  // The number is the size, never a count: one piece, two inches long. Reading
  // it as two of something is what would double the line's nutrition.
  it("counts the inches, not the pieces", () => {
    expect(parseLineDeterministic("2-inch piece ginger", 0)).toMatchObject({
      quantity: 2,
      unit: "inch",
      name: "ginger",
    });
  });

  // The deterministic parser has no note extraction — prep text rides along in
  // the name exactly as it does for "2 cups flour, sifted". The LLM parse is
  // what splits a note out.
  it("leaves preparation text on the name", () => {
    expect(parseLineDeterministic("2-inch piece ginger, peeled", 0)).toMatchObject({
      name: "ginger, peeled",
      note: null,
    });
  });

  // Same words, different jobs: with no dimension in front of it, "sticks" is
  // what the line counts, and a word can also simply name the food.
  it("only strips the object word when a dimension sized it", () => {
    expect(parseLineDeterministic("2 sticks butter", 0)).toMatchObject({
      quantity: 2,
      unit: null,
      name: "sticks butter",
    });
    expect(parseLineDeterministic("3-inch cinnamon stick", 0)).toMatchObject({
      quantity: 3,
      unit: "inch",
      name: "cinnamon stick",
    });
  });
});
