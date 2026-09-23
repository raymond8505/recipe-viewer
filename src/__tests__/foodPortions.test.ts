import { describe, it, expect } from "vitest";
import {
  normalizeFoodPortions,
  portionConflictMessage,
  portionLabel,
  FOOD_PORTION_UNIQUE_RULE,
} from "@/lib/foodPortions";

describe("portionLabel", () => {
  it("prefers measureUnit.name when USDA supplies a real one", () => {
    expect(portionLabel({ gramWeight: 120, measureUnit: { name: "cup" } })).toBe("cup");
  });

  // SR Legacy foods park the household measure in `modifier` and set
  // measureUnit.name to the literal string "undetermined".
  it("falls back to modifier when measureUnit is undetermined", () => {
    expect(
      portionLabel({
        gramWeight: 2.1,
        modifier: "tsp, whole",
        measureUnit: { name: "undetermined" },
      }),
    ).toBe("tsp, whole");
  });

  it("returns null for a bare weight", () => {
    expect(portionLabel({ gramWeight: 100 })).toBeNull();
  });
});

describe("normalizeFoodPortions", () => {
  it("keeps distinct portions in the order given", () => {
    const portions = [
      { gramWeight: 85, modifier: "1/4 package" },
      { gramWeight: 120, modifier: "cup" },
    ];
    const { portions: out, conflicts } = normalizeFoodPortions(portions);
    expect(out).toEqual(portions);
    expect(conflicts).toEqual([]);
  });

  // The Catelli case: the same portion arriving twice is one portion, not an
  // error — the caller said the same true thing twice.
  it("collapses an exactly repeated portion", () => {
    const { portions, conflicts } = normalizeFoodPortions([
      { gramWeight: 85, modifier: "1/4 package" },
      { gramWeight: 85, modifier: "1/4 package" },
    ]);
    expect(portions).toEqual([{ gramWeight: 85, modifier: "1/4 package" }]);
    expect(conflicts).toEqual([]);
  });

  it("reports a label given two different weights", () => {
    const { conflicts } = normalizeFoodPortions([
      { gramWeight: 85, modifier: "cup" },
      { gramWeight: 90, modifier: "cup" },
    ]);
    expect(conflicts).toEqual(["cup"]);
  });

  // A weight can be reached by more than one route, and naming both is useful
  // — it is only the NAME that promises a single weight.
  it("keeps one weight under two different labels", () => {
    const portions = [
      { gramWeight: 85, modifier: "1/4 package" },
      { gramWeight: 85, modifier: "about 1 cup" },
    ];
    const { portions: out, conflicts } = normalizeFoodPortions(portions);
    expect(out).toEqual(portions);
    expect(conflicts).toEqual([]);
  });

  it("treats a label as the same name whatever its casing or padding", () => {
    const { portions, conflicts } = normalizeFoodPortions([
      { gramWeight: 85, modifier: "Cup" },
      { gramWeight: 85, modifier: " cup " },
    ]);
    // Collapsed to one — and the caller's own casing is what survives.
    expect(portions).toEqual([{ gramWeight: 85, modifier: "Cup" }]);
    expect(conflicts).toEqual([]);
  });

  // "2 tbsp" and "1 tbsp" share a unit but are different measures, so the
  // household amount is part of a portion's identity.
  it("separates the same unit at different amounts", () => {
    const portions = [
      { gramWeight: 14, amount: 1, modifier: "tbsp" },
      { gramWeight: 28, amount: 2, modifier: "tbsp" },
    ];
    const { portions: out, conflicts } = normalizeFoodPortions(portions);
    expect(out).toEqual(portions);
    expect(conflicts).toEqual([]);
  });

  it("treats an omitted amount as 1", () => {
    const { portions, conflicts } = normalizeFoodPortions([
      { gramWeight: 14, modifier: "tbsp" },
      { gramWeight: 14, amount: 1, modifier: "tbsp" },
    ]);
    expect(portions).toHaveLength(1);
    expect(conflicts).toEqual([]);
  });

  // An unlabelled portion renders as its own weight ("100 g", "85 g"), so two
  // of them are distinct servings with no name to contradict.
  it("keeps unlabelled portions at different weights", () => {
    const portions = [{ gramWeight: 100 }, { gramWeight: 85 }];
    const { portions: out, conflicts } = normalizeFoodPortions(portions);
    expect(out).toEqual(portions);
    expect(conflicts).toEqual([]);
  });

  it("collapses identical unlabelled portions", () => {
    const { portions, conflicts } = normalizeFoodPortions([
      { gramWeight: 100 },
      { gramWeight: 100 },
    ]);
    expect(portions).toEqual([{ gramWeight: 100 }]);
    expect(conflicts).toEqual([]);
  });

  it("reports each conflicting label once, in the order they appear", () => {
    const { conflicts } = normalizeFoodPortions([
      { gramWeight: 85, modifier: "cup" },
      { gramWeight: 30, modifier: "scoop" },
      { gramWeight: 90, modifier: "cup" },
      { gramWeight: 95, modifier: "cup" },
      { gramWeight: 31, modifier: "scoop" },
    ]);
    expect(conflicts).toEqual(["cup", "scoop"]);
  });

  it("returns an empty list unchanged", () => {
    expect(normalizeFoodPortions([])).toEqual({ portions: [], conflicts: [] });
  });
});

describe("portionConflictMessage", () => {
  it("names every offending label and states the rule", () => {
    const message = portionConflictMessage(["cup", "scoop"]);
    expect(message).toContain('"cup", "scoop"');
    // The rule is one constant shared with both model-facing descriptions.
    expect(message).toContain(FOOD_PORTION_UNIQUE_RULE);
  });
});
