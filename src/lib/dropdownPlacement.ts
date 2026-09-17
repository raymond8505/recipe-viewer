// Where an absolutely-positioned dropdown should open, and how tall it may be.
//
// The problem this solves is not the viewport — it's the chrome a table pins
// inside its own scrollport. NutritionDetail's totals band is a `sticky
// bottom-0` `<tfoot>` painted over everything the body scrolls under it, so a
// dropdown on one of the last rows opens straight underneath it and its options
// are unreachable. The scroll box is `overflow-auto`, which clips the dropdown
// at the scrollport edge as well.
//
// So "room below" means: from the trigger down to the scrollport's bottom edge,
// minus whatever is pinned there. Same in reverse for "room above" and a sticky
// header. Client-only (every function takes a live element), but pure of React.

/** Which side of the trigger the panel opens on. */
export type Placement = "below" | "above";

export interface PlacementChoice {
  placement: Placement;
  /** Height cap for the panel, in px. */
  maxHeight: number;
}

export interface PlacementSpace {
  spaceAbove: number;
  spaceBelow: number;
  /** The panel's natural cap — how tall it would like to be. */
  desired: number;
}

/** The `mt-1`/`mb-1` the panel sits off its trigger by. */
const GAP = 4;

// A panel clamped to a sliver is worse than one that overlaps something: at
// that point neither side works, and a list you can't read is not a fix.
const MIN_PANEL = 120;

/**
 * Pick a side and a height cap from the room on each one.
 *
 * Flips **only** when below genuinely can't hold the panel AND above is
 * roomier. The asymmetry is load-bearing rather than tidy: an unmeasurable
 * layout reports 0 on both sides (jsdom gives every rect a height of 0), and
 * `0 > 0` is false — so tests and stories keep the "below" they render today
 * instead of flipping on a measurement that never happened. For the same
 * reason a non-positive space yields the full `desired` height, not a
 * zero-height panel.
 *
 * Pure — the measuring lives in `measurePlacement`.
 */
export function choosePlacement({
  spaceAbove,
  spaceBelow,
  desired,
}: PlacementSpace): PlacementChoice {
  const flip = spaceBelow < desired && spaceAbove > spaceBelow;
  const space = flip ? spaceAbove : spaceBelow;
  return {
    placement: flip ? "above" : "below",
    maxHeight:
      space > 0 ? Math.round(Math.max(MIN_PANEL, Math.min(desired, space))) : desired,
  };
}

/**
 * Nearest ancestor that scrolls — the box that actually clips an absolutely
 * positioned dropdown. Null means nothing does, so the viewport is the bound.
 */
export function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node != null; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

export interface StickyInsets {
  top: number;
  bottom: number;
}

// A table pins its header and footer either on the section element (the totals
// `<tfoot>`) or on the individual cells (the column headers — see
// `tableStyles.ts`), so both spellings have to count as pinned.
function stickyBandHeight(band: HTMLTableSectionElement): number {
  const pinned =
    getComputedStyle(band).position === "sticky" ||
    Array.from(band.rows[0]?.cells ?? []).some(
      (cell) => getComputedStyle(cell).position === "sticky",
    );
  return pinned ? band.getBoundingClientRect().height : 0;
}

/**
 * How much of a scrollport's top and bottom edge is covered by chrome pinned
 * inside it. Returns zeroes when nothing is pinned — which is also what a
 * styleless environment (jsdom) reports, leaving the scrollport edges as the
 * only bound.
 */
export function stickyInsets(scrollport: HTMLElement): StickyInsets {
  let top = 0;
  let bottom = 0;
  for (const band of scrollport.querySelectorAll("thead, tfoot")) {
    const height = stickyBandHeight(band as HTMLTableSectionElement);
    if (band.tagName === "THEAD") top = Math.max(top, height);
    else bottom = Math.max(bottom, height);
  }
  return { top, bottom };
}

/**
 * Measure the room around a trigger and choose a placement. The bound is the
 * nearest scrolling ancestor (the viewport when there is none), pulled in by
 * anything pinned against its edges.
 */
export function measurePlacement(
  anchor: HTMLElement,
  desired: number,
): PlacementChoice {
  const rect = anchor.getBoundingClientRect();
  const scrollport = scrollParentOf(anchor);
  const bounds = scrollport
    ? scrollport.getBoundingClientRect()
    : { top: 0, bottom: window.innerHeight };
  const insets = scrollport ? stickyInsets(scrollport) : { top: 0, bottom: 0 };

  return choosePlacement({
    spaceAbove: rect.top - (bounds.top + insets.top) - GAP,
    spaceBelow: bounds.bottom - insets.bottom - rect.bottom - GAP,
    desired,
  });
}
