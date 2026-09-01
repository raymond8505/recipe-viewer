import { describe, expect, it } from "vitest";
import {
  DEFAULT_PORTION_DRAFT,
  fromPortionDraft,
  fromPortionDrafts,
  portionGrams,
  portionOptionLabel,
  toPortionDraft,
  toPortionDrafts,
} from "@/components/ingredients/portions";

describe("portionGrams", () => {
  it("parses a positive gram weight", () => {
    expect(portionGrams({ label: "cup", grams: "240" })).toBe(240);
  });

  it("returns null for blank, non-numeric, or non-positive grams", () => {
    expect(portionGrams({ label: "", grams: "" })).toBeNull();
    expect(portionGrams({ label: "", grams: "abc" })).toBeNull();
    expect(portionGrams({ label: "", grams: "0" })).toBeNull();
    expect(portionGrams({ label: "", grams: "-5" })).toBeNull();
  });
});

describe("portionOptionLabel", () => {
  it("combines label and grams when both are present", () => {
    expect(portionOptionLabel({ label: "cup", grams: "240" })).toBe("cup (240 g)");
  });

  it("falls back to grams for the unlabelled default portion", () => {
    expect(portionOptionLabel(DEFAULT_PORTION_DRAFT)).toBe("100 g");
  });

  it("shows just the label when grams are missing", () => {
    expect(portionOptionLabel({ label: "cup", grams: "" })).toBe("cup");
  });
});

describe("fromPortionDraft", () => {
  it("emits a label-less portion for the default 100 g row", () => {
    expect(fromPortionDraft(DEFAULT_PORTION_DRAFT)).toEqual({ gramWeight: 100 });
  });

  it("puts the label in modifier", () => {
    expect(fromPortionDraft({ label: "cup", grams: "240" })).toEqual({
      modifier: "cup",
      gramWeight: 240,
    });
  });

  it("drops a row without a valid gram weight", () => {
    expect(fromPortionDraft({ label: "cup", grams: "" })).toBeNull();
  });
});

describe("fromPortionDrafts", () => {
  it("keeps valid portions and drops invalid ones", () => {
    expect(
      fromPortionDrafts([
        { label: "", grams: "100" },
        { label: "cup", grams: "" },
        { label: "tbsp", grams: "15" },
      ]),
    ).toEqual([{ gramWeight: 100 }, { modifier: "tbsp", gramWeight: 15 }]);
  });
});

describe("toPortionDraft", () => {
  it("reads modifier as the label", () => {
    expect(toPortionDraft({ modifier: "tsp, whole", gramWeight: 2.1 })).toEqual({
      label: "tsp, whole",
      grams: "2.1",
    });
  });

  it("folds a household amount into the label", () => {
    expect(
      toPortionDraft({ amount: 2, modifier: "tbsp", gramWeight: 30 }),
    ).toEqual({ label: "2 tbsp", grams: "30" });
  });

  it("uses measureUnit.name when there is no modifier, ignoring 'undetermined'", () => {
    expect(
      toPortionDraft({ measureUnit: { name: "cup" }, gramWeight: 240 }),
    ).toEqual({ label: "cup", grams: "240" });
    expect(
      toPortionDraft({ measureUnit: { name: "undetermined" }, gramWeight: 5 }),
    ).toEqual({ label: "", grams: "5" });
  });
});

describe("toPortionDrafts", () => {
  it("falls back to the default 100 g portion when there are none", () => {
    expect(toPortionDrafts(null)).toEqual([DEFAULT_PORTION_DRAFT]);
    expect(toPortionDrafts([])).toEqual([DEFAULT_PORTION_DRAFT]);
  });

  it("maps stored portions to drafts", () => {
    expect(
      toPortionDrafts([{ modifier: "cup", gramWeight: 240 }]),
    ).toEqual([{ label: "cup", grams: "240" }]);
  });
});
