import { describe, it, expect } from "vitest";
import {
  parseIngredient,
  parseIngredientRanged,
  parseAmountToken,
  formatParsedAmount,
  convert,
  getUnitGroup,
  formatAmount,
  parseServings,
  roundToQuarter,
} from "@/lib/units";

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

  it("parses range and returns midpoint", () => {
    // "6-8 servings" → midpoint 7. Consistent with anchor-on-range semantics in ScalableRecipe.
    expect(parseServings("6-8 servings")).toBe(7);
  });

  it("parses 'to' range and returns midpoint", () => {
    expect(parseServings("2 to 4 servings")).toBe(3);
  });

  it("parses en-dash range and returns midpoint", () => {
    expect(parseServings("4–6 servings")).toBe(5);
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

describe("parseAmountToken", () => {
  it("parses integer", () => {
    expect(parseAmountToken("3")).toEqual({ kind: "single", value: 3 });
  });

  it("parses decimal", () => {
    expect(parseAmountToken("2.5")).toEqual({ kind: "single", value: 2.5 });
  });

  it("parses ASCII fraction", () => {
    expect(parseAmountToken("3/4")).toEqual({ kind: "single", value: 0.75 });
  });

  it("parses ASCII mixed number", () => {
    expect(parseAmountToken("1 1/2")).toEqual({ kind: "single", value: 1.5 });
  });

  it("parses unicode fraction ½", () => {
    expect(parseAmountToken("½")).toEqual({ kind: "single", value: 0.5 });
  });

  it("parses unicode fraction ⅔", () => {
    expect(parseAmountToken("⅔")).toEqual({ kind: "single", value: 2 / 3 });
  });

  it("parses unicode mixed 1½ (no space)", () => {
    expect(parseAmountToken("1½")).toEqual({ kind: "single", value: 1.5 });
  });

  it("parses unicode mixed 1 ½ (with space)", () => {
    expect(parseAmountToken("1 ½")).toEqual({ kind: "single", value: 1.5 });
  });

  it("parses ASCII-hyphen range", () => {
    expect(parseAmountToken("3-5")).toEqual({ kind: "range", min: 3, max: 5 });
  });

  it("parses en-dash range", () => {
    expect(parseAmountToken("2–3")).toEqual({ kind: "range", min: 2, max: 3 });
  });

  it("parses em-dash range", () => {
    expect(parseAmountToken("2—3")).toEqual({ kind: "range", min: 2, max: 3 });
  });

  it("parses 'to' range", () => {
    expect(parseAmountToken("2 to 3")).toEqual({ kind: "range", min: 2, max: 3 });
  });

  it("parses range of fractions", () => {
    const r = parseAmountToken("1/2 - 3/4");
    expect(r).toEqual({ kind: "range", min: 0.5, max: 0.75 });
  });

  it("parses range of unicode mixed", () => {
    const r = parseAmountToken("1½–2¼");
    expect(r?.kind).toBe("range");
    if (r?.kind === "range") {
      expect(r.min).toBeCloseTo(1.5);
      expect(r.max).toBeCloseTo(2.25);
    }
  });

  it("returns null for non-numeric input", () => {
    expect(parseAmountToken("abc")).toBeNull();
    expect(parseAmountToken("")).toBeNull();
  });
});

describe("formatParsedAmount", () => {
  it("formats single integer", () => {
    expect(formatParsedAmount({ kind: "single", value: 2 })).toBe("2");
  });

  it("formats single fraction with unicode", () => {
    expect(formatParsedAmount({ kind: "single", value: 0.5 })).toBe("½");
  });

  it("formats single mixed with unicode", () => {
    expect(formatParsedAmount({ kind: "single", value: 1.5 })).toBe("1½");
  });

  it("formats integer range with ASCII hyphen", () => {
    expect(formatParsedAmount({ kind: "range", min: 3, max: 5 })).toBe("3-5");
  });

  it("formats fractional range with unicode", () => {
    expect(formatParsedAmount({ kind: "range", min: 4.5, max: 7.5 })).toBe("4½-7½");
  });
});

describe("parseIngredientRanged", () => {
  it("parses single-amount ingredient with unit", () => {
    const r = parseIngredientRanged("2 cups flour");
    expect(r).not.toBeNull();
    expect(r!.amount).toEqual({ kind: "single", value: 2 });
    expect(r!.unit).toBe("cup");
    expect(r!.rest).toBe("flour");
  });

  it("parses range ingredient and strips the range from rest", () => {
    const r = parseIngredientRanged("3-5 cloves garlic");
    expect(r).not.toBeNull();
    expect(r!.amount).toEqual({ kind: "range", min: 3, max: 5 });
    expect(r!.unit).toBeNull();
    expect(r!.rest).toBe("cloves garlic");
  });

  it("parses 'to' range with unit", () => {
    const r = parseIngredientRanged("2 to 3 tablespoons olive oil");
    expect(r).not.toBeNull();
    expect(r!.amount).toEqual({ kind: "range", min: 2, max: 3 });
    expect(r!.unit).toBe("tbsp");
    expect(r!.rest).toBe("olive oil");
  });

  it("parses unicode-fraction ingredient", () => {
    const r = parseIngredientRanged("½ cup sugar");
    expect(r).not.toBeNull();
    expect(r!.amount).toEqual({ kind: "single", value: 0.5 });
    expect(r!.unit).toBe("cup");
    expect(r!.rest).toBe("sugar");
  });

  it("parses unicode-mixed ingredient", () => {
    const r = parseIngredientRanged("1½ cups milk");
    expect(r).not.toBeNull();
    expect(r!.amount).toEqual({ kind: "single", value: 1.5 });
    expect(r!.unit).toBe("cup");
    expect(r!.rest).toBe("milk");
  });

  it("does not match 'to' inside word (1 tomato)", () => {
    const r = parseIngredientRanged("1 tomato");
    expect(r).not.toBeNull();
    expect(r!.amount).toEqual({ kind: "single", value: 1 });
    expect(r!.rest).toBe("tomato");
  });

  it("returns null for non-numeric ingredient", () => {
    expect(parseIngredientRanged("salt to taste")).toBeNull();
  });
});
