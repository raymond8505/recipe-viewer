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
 * Sizes a ribbon child: snaps to the ribbon's start edge and holds its
 * content width between `min-w-56` and `max-w-72`.
 *
 * @remarks
 * The cap keeps every card inside a phone viewport, which `snap-mandatory`
 * requires to reach it, and is what lets a `truncate`d label overflow into
 * an ellipsis. The floor holds a card's width steady when its content
 * changes (e.g. the delete-confirm overlay).
 */
export function RibbonItem({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("snap-start shrink-0 min-w-56 max-w-72", className)}
      {...props}
    />
  );
}
