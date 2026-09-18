"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import {
  measurePlacement,
  scrollParentOf,
  type PlacementChoice,
} from "@/lib/dropdownPlacement";

/**
 * Keep an open dropdown on the side of its trigger that has room for it, and
 * capped to that room.
 *
 * Re-measures on open, on `revision` (pass whatever changes the panel's
 * content — an options count, say: USDA results append to a list that is
 * already open, and a taller list can stop fitting), on a scroll of the
 * clipping ancestor, and on resize. Wheel-scrolling does not close the panel,
 * so the scroll listener is what keeps a flipped panel honest as its trigger
 * moves.
 *
 * A measurement that lands on the same choice returns the previous object, so
 * scrolling with a panel open doesn't re-render on every frame.
 *
 * @summary side + height cap for an open dropdown, re-measured as the page moves
 */
export function useDropdownPlacement(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  desired: number,
  revision?: unknown,
): PlacementChoice {
  const [choice, setChoice] = useState<PlacementChoice>({
    placement: "below",
    maxHeight: desired,
  });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!open || anchor == null) {
      setChoice({ placement: "below", maxHeight: desired });
      return;
    }

    const measure = () =>
      setChoice((prev) => {
        const next = measurePlacement(anchor, desired);
        return prev.placement === next.placement &&
          prev.maxHeight === next.maxHeight
          ? prev
          : next;
      });

    measure();

    const scrollport = scrollParentOf(anchor);
    scrollport?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      scrollport?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [anchorRef, open, desired, revision]);

  return choice;
}
