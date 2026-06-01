import { describe, it, expect } from "vitest";
import {
  parseIngredient,
  parseAmountToken,
  formatParsedAmount,
  convert,
  getUnitGroup,
  formatAmount,
  parseServings,
  roundDecimal,
  getDefaultVolumeUnit,
  closestCommonFraction,
} from "@/lib/units";

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
  it("formats integer with no decimal", () => {
    expect(formatAmount(2)).toBe("2");
  });

  it("strips trailing .0 for near-integer values", () => {
    expect(formatAmount(6.04)).toBe("6");
    expect(formatAmount(1.0)).toBe("1");
  });

  it("rounds to one decimal place", () => {
    expect(formatAmount(0.375)).toBe("0.4");
    expect(formatAmount(0.333)).toBe("0.3");
    expect(formatAmount(2.57)).toBe("2.6");
    expect(formatAmount(6.087)).toBe("6.1");
  });

  it("renders exact halves and tenths cleanly", () => {
    expect(formatAmount(0.5)).toBe("0.5");
    expect(formatAmount(1.5)).toBe("1.5");
    expect(formatAmount(0.1)).toBe("0.1");
  });

  it("rounds half-up away from zero", () => {
    // Math.round(0.25 * 10) = Math.round(2.5) = 3 in JS
    expect(formatAmount(0.25)).toBe("0.3");
    expect(formatAmount(0.75)).toBe("0.8");
  });
});

describe("roundDecimal", () => {
  it("rounds to 1 decimal place by default", () => {
    expect(roundDecimal(0.375)).toBe(0.4);
    expect(roundDecimal(1.04)).toBe(1);
    expect(roundDecimal(6.087)).toBe(6.1);
  });

  it("supports custom precision", () => {
    expect(roundDecimal(0.375, 2)).toBe(0.38);
    expect(roundDecimal(1.555, 2)).toBe(1.56);
  });

  it("leaves exact decimals unchanged", () => {
    expect(roundDecimal(0.5)).toBe(0.5);
    expect(roundDecimal(2.0)).toBe(2);
  });
});

describe("getDefaultVolumeUnit", () => {
  it("returns tsp below 7 ml", () => {
    expect(getDefaultVolumeUnit(0.1)).toBe("tsp");
    expect(getDefaultVolumeUnit(5)).toBe("tsp");
    expect(getDefaultVolumeUnit(6.99)).toBe("tsp");
  });

  it("returns tbsp at the 7 ml boundary", () => {
    expect(getDefaultVolumeUnit(7)).toBe("tbsp");
    expect(getDefaultVolumeUnit(7.01)).toBe("tbsp");
  });

  it("returns tbsp through the 60 ml boundary", () => {
    expect(getDefaultVolumeUnit(30)).toBe("tbsp");
    expect(getDefaultVolumeUnit(59.99)).toBe("tbsp");
    expect(getDefaultVolumeUnit(60)).toBe("tbsp");
  });

  it("returns cup above 60 ml", () => {
    expect(getDefaultVolumeUnit(60.01)).toBe("cup");
    expect(getDefaultVolumeUnit(90)).toBe("cup");
    expect(getDefaultVolumeUnit(240)).toBe("cup");
    expect(getDefaultVolumeUnit(1000)).toBe("cup");
  });
});

describe("closestCommonFraction", () => {
  it("snaps 0.4 cup to ⅓ cup", () => {
    const hint = closestCommonFraction(0.4, "cup");
    expect(hint?.label).toBe("⅓ cup");
    expect(hint?.value).toBeCloseTo(1 / 3, 4);
  });

  it("snaps 0.7 cup to ⅔ cup", () => {
    const hint = closestCommonFraction(0.7, "cup");
    expect(hint?.label).toBe("⅔ cup");
  });

  it("snaps 0.5 cup to ½ cup", () => {
    const hint = closestCommonFraction(0.5, "cup");
    expect(hint?.label).toBe("½ cup");
    expect(hint?.value).toBe(0.5);
  });

  it("snaps 1.4 cup to 1⅓ cup (mixed)", () => {
    const hint = closestCommonFraction(1.4, "cup");
    expect(hint?.label).toBe("1⅓ cup");
  });

  it("snaps 2.029 tbsp to 2 tbsp (integer)", () => {
    const hint = closestCommonFraction(2.029, "tbsp");
    expect(hint?.label).toBe("2 tbsp");
    expect(hint?.value).toBe(2);
  });

  it("snaps 1.7 tbsp to 1½ tbsp", () => {
    const hint = closestCommonFraction(1.7, "tbsp");
    expect(hint?.label).toBe("1½ tbsp");
  });

  it("snaps 1.2 tsp to 1¼ tsp", () => {
    const hint = closestCommonFraction(1.2, "tsp");
    expect(hint?.label).toBe("1¼ tsp");
  });

  it("returns null for units without a defined fraction set (ml, oz, g)", () => {
    expect(closestCommonFraction(90, "ml")).toBeNull();
    expect(closestCommonFraction(2, "oz")).toBeNull();
    expect(closestCommonFraction(200, "g")).toBeNull();
    expect(closestCommonFraction(3, "fl oz")).toBeNull();
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

  it("formats single fractional value as decimal", () => {
    expect(formatParsedAmount({ kind: "single", value: 0.5 })).toBe("0.5");
  });

  it("formats single mixed value as decimal", () => {
    expect(formatParsedAmount({ kind: "single", value: 1.5 })).toBe("1.5");
  });

  it("formats integer range with ASCII hyphen", () => {
    expect(formatParsedAmount({ kind: "range", min: 3, max: 5 })).toBe("3-5");
  });

  it("formats fractional range as decimals", () => {
    expect(formatParsedAmount({ kind: "range", min: 4.5, max: 7.5 })).toBe("4.5-7.5");
  });
});

describe("parseIngredient", () => {
  it("parses single-amount ingredient with unit", () => {
    const r = parseIngredient("2 cups flour");
    expect(r).not.toBeNull();
    expect(r!.amount).toEqual({ kind: "single", value: 2 });
    expect(r!.unit).toBe("cup");
    expect(r!.rest).toBe("flour");
  });

  it("parses range ingredient and strips the range from rest", () => {
    const r = parseIngredient("3-5 cloves garlic");
    expect(r).not.toBeNull();
    expect(r!.amount).toEqual({ kind: "range", min: 3, max: 5 });
    expect(r!.unit).toBeNull();
    expect(r!.rest).toBe("cloves garlic");
  });

  it("parses 'to' range with unit", () => {
    const r = parseIngredient("2 to 3 tablespoons olive oil");
    expect(r).not.toBeNull();
    expect(r!.amount).toEqual({ kind: "range", min: 2, max: 3 });
    expect(r!.unit).toBe("tbsp");
    expect(r!.rest).toBe("olive oil");
  });

  it("parses unicode-fraction ingredient", () => {
    const r = parseIngredient("½ cup sugar");
    expect(r).not.toBeNull();
    expect(r!.amount).toEqual({ kind: "single", value: 0.5 });
    expect(r!.unit).toBe("cup");
    expect(r!.rest).toBe("sugar");
  });

  it("parses unicode-mixed ingredient", () => {
    const r = parseIngredient("1½ cups milk");
    expect(r).not.toBeNull();
    expect(r!.amount).toEqual({ kind: "single", value: 1.5 });
    expect(r!.unit).toBe("cup");
    expect(r!.rest).toBe("milk");
  });

  it("parses full unit name", () => {
    const r = parseIngredient("1 tablespoon olive oil");
    expect(r).not.toBeNull();
    expect(r!.unit).toBe("tbsp");
  });

  it("parses fl oz as a multi-word unit, not as oz", () => {
    const r = parseIngredient("2 fl oz water");
    expect(r).not.toBeNull();
    expect(r!.unit).toBe("fl oz");
  });

  it("does not match a unit alias mid-word (large vs liter)", () => {
    const r = parseIngredient("1 large egg");
    expect(r).not.toBeNull();
    expect(r!.unit).toBeNull();
    expect(r!.rest).toBe("large egg");
  });

  it("preserves rest text containing punctuation", () => {
    const r = parseIngredient("2 tbsp olive oil, divided");
    expect(r).not.toBeNull();
    expect(r!.rest).toBe("olive oil, divided");
  });

  it("does not match 'to' inside word (1 tomato)", () => {
    const r = parseIngredient("1 tomato");
    expect(r).not.toBeNull();
    expect(r!.amount).toEqual({ kind: "single", value: 1 });
    expect(r!.rest).toBe("tomato");
  });

  it("returns null for non-numeric ingredient", () => {
    expect(parseIngredient("salt to taste")).toBeNull();
  });
});
