"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * DraggableRibbon — a horizontal scrollable ribbon using native browser scroll
 * and CSS scroll snapping. No JS drag logic; works with touch and mouse natively.
 *
 * Wrap each child in `RibbonItem` so items snap into place and don't compress.
 */

interface DraggableRibbonProps {
  className?: string;
  children: React.ReactNode;
}

export default function DraggableRibbon({ className = "", children }: DraggableRibbonProps) {
  return (
    <div
      className={`flex overflow-x-auto snap-x snap-mandatory ribbon-scroll ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * RibbonItem — the sizing contract for a ribbon child. Bounded, not fixed:
 * the item sizes to its content between `min-w-56` and `max-w-72`.
 *
 * The cap is what makes a long timer label `truncate` instead of pushing the
 * card past the phone's edge (where `snap-mandatory` can't reach the rest).
 * The floor keeps short timers uniform and stops a card shrinking when its
 * content swaps to the narrower delete-confirm overlay. A fixed `w-*` here
 * was sized for the old stacked TimerCard; the 3-column card's two fixed
 * side columns need ~212–245px on a phone, so a fixed width clipped the time.
 */
export function RibbonItem({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("snap-start shrink-0 min-w-56 max-w-72", className)}
      {...props}
    />
  );
}
