import { describe, it, expect } from "vitest";
import { parseIngredient, convert, getUnitGroup, formatAmount, parseServings, roundToQuarter } from "@/lib/units";

describe("parseIngredient", () => {
  it("parses integer amount with unit", () => {
    const r = parseIngredient("2 cups flour");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2);
    expect(r!.unit).toBe("cup");
    expect(r!.rest).toBe("flour");
  });

  it("parses fractional amount", () => {
    const r = parseIngredient("1/2 tsp salt");
    expect(r).not.toBeNull();
    expect(r!.amount).toBeCloseTo(0.5);
    expect(r!.unit).toBe("tsp");
  });

  it("parses mixed number amount", () => {
    const r = parseIngredient("1 1/2 cups butter");
    expect(r).not.toBeNull();
    expect(r!.amount).toBeCloseTo(1.5);
    expect(r!.unit).toBe("cup");
  });

  it("parses decimal amount", () => {
    const r = parseIngredient("2.5 lbs chicken");
    expect(r).not.toBeNull();
    expect(r!.amount).toBeCloseTo(2.5);
    expect(r!.unit).toBe("lb");
  });

  it("parses full unit name", () => {
    const r = parseIngredient("1 tablespoon olive oil");
    expect(r).not.toBeNull();
    expect(r!.unit).toBe("tbsp");
  });

  it("parses plural unit name", () => {
    const r = parseIngredient("2 tablespoons olive oil");
    expect(r).not.toBeNull();
    expect(r!.unit).toBe("tbsp");
  });

  it("returns amount with null unit for no known unit", () => {
    const r = parseIngredient("3 large eggs");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(3);
    expect(r!.unit).toBeNull();
    expect(r!.rest).toBe("large eggs");
  });

  it("returns null for no amount", () => {
    expect(parseIngredient("salt to taste")).toBeNull();
  });

  it("parses fl oz (not as oz)", () => {
    const r = parseIngredient("2 fl oz water");
    expect(r).not.toBeNull();
    expect(r!.unit).toBe("fl oz");
  });

  it("parses oz by itself", () => {
    const r = parseIngredient("14 oz canned tomatoes");
    expect(r).not.toBeNull();
    expect(r!.unit).toBe("oz");
  });

  it("parses grams", () => {
    const r = parseIngredient("100 g butter");
    expect(r).not.toBeNull();
    expect(r!.unit).toBe("g");
  });

  it("parses kg", () => {
    const r = parseIngredient("1 kg flour");
    expect(r).not.toBeNull();
    expect(r!.unit).toBe("kg");
  });

  it("does not match unit mid-word (large != liter)", () => {
    const r = parseIngredient("1 large egg");
    expect(r).not.toBeNull();
    expect(r!.unit).toBeNull();
    expect(r!.rest).toBe("large egg");
  });

  it("preserves rest text correctly", () => {
    const r = parseIngredient("2 tbsp olive oil, divided");
    expect(r).not.toBeNull();
    expect(r!.rest).toBe("olive oil, divided");
  });
});

describe("convert", () => {
  it("converts tbsp to tsp (1 tbsp = 3 tsp)", () => {
    expect(convert(1, "tbsp", "tsp")).toBeCloseTo(3);
  });

  it("converts cup to ml (1 cup ≈ 236.59 ml)", () => {
    expect(convert(1, "cup", "ml")).toBeCloseTo(236.59, 0);
  });

  it("converts oz to g (1 oz ≈ 28.35 g)", () => {
    expect(convert(1, "oz", "g")).toBeCloseTo(28.35, 0);
  });

  it("converts lb to oz (1 lb = 16 oz)", () => {
    expect(convert(1, "lb", "oz")).toBeCloseTo(16, 0);
  });

  it("identity conversion returns same amount", () => {
    expect(convert(3, "cup", "cup")).toBeCloseTo(3);
  });

  it("returns amount unchanged for unknown from-unit", () => {
    expect(convert(5, "unknown", "cup")).toBe(5);
  });

  it("returns amount unchanged for cross-group conversion", () => {
    expect(convert(1, "cup", "oz")).toBe(1);
  });
});

describe("getUnitGroup", () => {
  it("returns all volume units for a volume unit", () => {
    const group = getUnitGroup("cup");
    expect(group).toContain("tsp");
    expect(group).toContain("tbsp");
    expect(group).toContain("cup");
    expect(group).toContain("ml");
    expect(group).toContain("l");
    expect(group).not.toContain("oz");
  });

  it("returns all weight units for a weight unit", () => {
    const group = getUnitGroup("oz");
    expect(group).toContain("oz");
    expect(group).toContain("lb");
    expect(group).toContain("g");
    expect(group).toContain("kg");
    expect(group).not.toContain("cup");
  });

  it("returns the unit itself for unknown unit", () => {
    expect(getUnitGroup("unknown")).toEqual(["unknown"]);
  });
});

describe("formatAmount", () => {
  it("formats integer", () => {
    expect(formatAmount(2)).toBe("2");
  });

  it("formats ½", () => {
    expect(formatAmount(0.5)).toBe("½");
  });

  it("formats ¼", () => {
    expect(formatAmount(0.25)).toBe("¼");
  });

  it("formats ¾", () => {
    expect(formatAmount(0.75)).toBe("¾");
  });

  it("formats mixed number 1½", () => {
    expect(formatAmount(1.5)).toBe("1½");
  });

  it("formats mixed number 2¼", () => {
    expect(formatAmount(2.25)).toBe("2¼");
  });

  it("formats decimal for non-fraction values", () => {
    expect(formatAmount(2.57)).toBe("2.57");
  });

  it("formats decimal for value not close to a fraction", () => {
    expect(formatAmount(1.57)).toBe("1.57");
  });
});

describe("roundToQuarter", () => {
  it("rounds down to nearest 0.25", () => {
    expect(roundToQuarter(1.1)).toBe(1);
  });

  it("rounds up to nearest 0.25", () => {
    expect(roundToQuarter(1.4)).toBe(1.5);
  });

  it("leaves exact quarters unchanged", () => {
    expect(roundToQuarter(1.25)).toBe(1.25);
    expect(roundToQuarter(1.5)).toBe(1.5);
    expect(roundToQuarter(1.75)).toBe(1.75);
    expect(roundToQuarter(2)).toBe(2);
  });

  it("rounds 1/3 cup (0.333) to 0.25", () => {
    expect(roundToQuarter(1 / 3)).toBe(0.25);
  });
});

describe("parseServings", () => {
  it("parses plain number string", () => {
    expect(parseServings("4")).toBe(4);
  });

  it("parses 'N servings' format", () => {
    expect(parseServings("4 servings")).toBe(4);
  });

  it("parses 'Makes N' format", () => {
    expect(parseServings("Makes 6")).toBe(6);
  });

  it("parses range and returns first number", () => {
    expect(parseServings("6-8 servings")).toBe(6);
  });

  it("parses array by using first element", () => {
    expect(parseServings(["8 servings", "8"])).toBe(8);
  });

  it("returns null for undefined", () => {
    expect(parseServings(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseServings("")).toBeNull();
  });

  it("returns null when no number present", () => {
    expect(parseServings("a few servings")).toBeNull();
  });
});
