// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  canonicalizeInstructions,
  flattenSteps,
  stepKey,
  stepTimers,
} from "@/lib/recipeInstructions";
import { makeInstructionGroup, makeStep, makeSteps } from "@/fixtures";

describe("flattenSteps / stepTimers", () => {
  const groups = [
    makeInstructionGroup(undefined, ["Preheat.", makeStep("Boil.", { name: "Boil", seconds: 300 })]),
    makeInstructionGroup("Sauce", [
      makeStep("Simmer.", { name: "Simmer", seconds: 330 }),
      makeStep("Label only.", { name: "Rest" }),
    ]),
  ];

  it("reads group by group, step by step", () => {
    expect(flattenSteps(groups).map((s) => s.text)).toEqual([
      "Preheat.",
      "Boil.",
      "Simmer.",
      "Label only.",
    ]);
  });

  it("lists only the steps carrying both a label and a duration", () => {
    expect(stepTimers(groups)).toEqual([
      { name: "Boil", seconds: 300 },
      { name: "Simmer", seconds: 330 },
    ]);
  });
});

describe("stepKey", () => {
  it("joins the group and step indexes", () => {
    expect(stepKey(0, 2)).toBe("0-2");
    expect(stepKey(3, 0)).toBe("3-0");
  });
});

describe("canonicalizeInstructions", () => {
  it("trims text and names, and drops blank steps, blank names and empty groups", () => {
    expect(
      canonicalizeInstructions([
        { name: "  ", steps: [{ text: "  Chop. ", name: " " }] },
        { name: " Sauce ", steps: [{ text: "   " }, { text: "Simmer.", name: " Simmer " }] },
        { name: "Empty", steps: [] },
      ]),
    ).toEqual([
      { steps: [{ text: "Chop." }] },
      { name: "Sauce", steps: [{ text: "Simmer.", name: "Simmer" }] },
    ]);
  });

  it("keeps seconds only as a positive whole number beside a name", () => {
    expect(
      canonicalizeInstructions([
        {
          steps: [
            { text: "Both", name: "Rest", seconds: 600 },
            { text: "No name", seconds: 600 },
            { text: "Zero", name: "Zero", seconds: 0 },
            { text: "Fraction", name: "Frac", seconds: 1.5 },
          ],
        },
      ]),
    ).toEqual([
      {
        steps: [
          { text: "Both", name: "Rest", seconds: 600 },
          { text: "No name" },
          { text: "Zero", name: "Zero" },
          { text: "Fraction", name: "Frac" },
        ],
      },
    ]);
  });

  // Two nameless runs in a row have no Schema.org spelling that keeps them
  // apart, so canonical form has none — that is what makes the round trip lossless.
  it("merges adjacent nameless groups but keeps one on either side of a named group", () => {
    expect(
      canonicalizeInstructions([
        makeInstructionGroup(undefined, ["One."]),
        makeInstructionGroup(undefined, ["Two."]),
        makeInstructionGroup("Sauce", ["Three."]),
        makeInstructionGroup(undefined, ["Four."]),
      ]),
    ).toEqual([
      { steps: [{ text: "One." }, { text: "Two." }] },
      { name: "Sauce", steps: [{ text: "Three." }] },
      { steps: [{ text: "Four." }] },
    ]);
  });

  it("does not mutate its input", () => {
    const input = [
      makeInstructionGroup(undefined, ["One."]),
      makeInstructionGroup(undefined, [" Two. "]),
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    canonicalizeInstructions(input);
    expect(input).toEqual(snapshot);
  });

  it("leaves a canonical list unchanged", () => {
    const groups = [
      makeInstructionGroup(undefined, ["One."]),
      makeInstructionGroup("Sauce", [makeStep("Simmer.", { name: "Simmer", seconds: 330 })]),
    ];
    expect(canonicalizeInstructions(groups)).toEqual(groups);
  });
});

describe("fixture factories", () => {
  it("makeSteps builds one nameless group from texts and ready-made steps", () => {
    const [group] = makeSteps(["Chop.", makeStep("Rest.", { name: "Rest", seconds: 60 })]);
    expect(group).not.toHaveProperty("name");
    expect(group.steps).toEqual([{ text: "Chop." }, { text: "Rest.", name: "Rest", seconds: 60 }]);
  });
});
