import { describe, expect, it } from "vitest";
import { choosePlacement } from "@/lib/dropdownPlacement";

const DESIRED = 240;

describe("choosePlacement", () => {
  it("opens below when the panel fits there", () => {
    expect(
      choosePlacement({ spaceAbove: 100, spaceBelow: 400, desired: DESIRED }),
    ).toEqual({ placement: "below", maxHeight: DESIRED });
  });

  it("stays below when below is tight but still roomier than above", () => {
    expect(
      choosePlacement({ spaceAbove: 80, spaceBelow: 180, desired: DESIRED }),
    ).toEqual({ placement: "below", maxHeight: 180 });
  });

  // The case this module exists for: a row near the bottom of the breakdown
  // table, where the sticky totals band eats what little room was left.
  it("flips above and clamps to the room there", () => {
    expect(
      choosePlacement({ spaceAbove: 190, spaceBelow: 30, desired: DESIRED }),
    ).toEqual({ placement: "above", maxHeight: 190 });
  });

  it("does not clamp below the full height when above has room to spare", () => {
    expect(
      choosePlacement({ spaceAbove: 500, spaceBelow: 40, desired: DESIRED }),
    ).toEqual({ placement: "above", maxHeight: DESIRED });
  });

  // Neither side works. A panel clamped to a sliver is worse than one that
  // overlaps, so it keeps a readable minimum and takes the roomier side.
  it("keeps a usable height when neither side fits", () => {
    expect(
      choosePlacement({ spaceAbove: 60, spaceBelow: 20, desired: DESIRED }),
    ).toEqual({ placement: "above", maxHeight: 120 });
  });

  // jsdom gives every rect a height of 0, and so does any layout that hasn't
  // happened yet. Measuring nothing must not flip the panel or collapse it —
  // the strict `spaceAbove > spaceBelow` is what keeps 0/0 rendering as it
  // does today.
  it("stays below at full height when the layout is unmeasurable", () => {
    expect(
      choosePlacement({ spaceAbove: 0, spaceBelow: 0, desired: DESIRED }),
    ).toEqual({ placement: "below", maxHeight: DESIRED });
  });

  it("treats a negative space as unmeasurable rather than a zero-height panel", () => {
    expect(
      choosePlacement({ spaceAbove: -50, spaceBelow: -10, desired: DESIRED }),
    ).toEqual({ placement: "below", maxHeight: DESIRED });
  });

  it("rounds a fractional measurement to a whole pixel", () => {
    expect(
      choosePlacement({ spaceAbove: 10, spaceBelow: 183.4, desired: DESIRED }),
    ).toEqual({ placement: "below", maxHeight: 183 });
  });
});
