"use client";

/**
 * DraggableRibbon — a horizontal scrollable ribbon using native browser scroll
 * and CSS scroll snapping. No JS drag logic; works with touch and mouse natively.
 *
 * Apply `snap-start shrink-0` (or a fixed width class) to each child so items
 * snap into place and don't compress.
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
