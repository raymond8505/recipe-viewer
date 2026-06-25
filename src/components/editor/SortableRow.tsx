"use client";

import { type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DragHandleButton } from "@/components/buttons";
import { cn } from "@/lib/utils";

export type DragHandleColor = "neutral" | "brand";

/** The colour-only difference between the ingredient/instruction handle and the
 *  section-header handle. Alignment/size come in per call via `handle({ className })`. */
const HANDLE_COLOR_CLASS: Record<DragHandleColor, string> = {
  neutral: "text-gray-300 hover:bg-muted hover:text-gray-600",
  brand: "text-brand hover:bg-muted",
};

interface HandleArgs {
  /** Accessible label, e.g. "Reorder 1 tsp cumin" / "Reorder section Sauce". */
  "aria-label": string;
  /** Per-call alignment/size classes (merged after the colour class). */
  className?: string;
  /** The handle's own visual disabled — separate from `useSortable`'s disabled. */
  disabled?: boolean;
}

interface SortableRowProps {
  /** Sortable id (bare item id, or a `group:`-prefixed group id). */
  id: string;
  /** Which palette the drag handle uses. */
  color: DragHandleColor;
  /** Passed straight to `useSortable` — boolean OR `{ draggable, droppable }`. */
  disabled?: boolean | { draggable?: boolean; droppable?: boolean };
  /** Classes for the moving wrapper `<div>` (the dnd-kit node). */
  className?: string;
  children: (api: {
    /** Renders the drag handle pre-bound to this row's dnd-kit listeners. */
    handle: (args: HandleArgs) => ReactNode;
    isDragging: boolean;
  }) => ReactNode;
}

/**
 * Owns the dnd-kit sortable concern for an editor row or group: it calls
 * `useSortable`, applies the node ref + drag transform/opacity to its wrapper
 * `<div>`, and hands the caller a `handle()` that already carries the drag
 * listeners + the chosen colour. Callers compose their own layout (inputs,
 * delete button, confirm overlay) inside the render-prop. Because the hook lives
 * here, the listeners are never spread by the caller — `handle()` binds them.
 */
export default function SortableRow({
  id,
  color,
  disabled,
  className,
  children,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  const handle = ({
    "aria-label": ariaLabel,
    className: handleClassName,
    disabled: handleDisabled,
  }: HandleArgs): ReactNode => (
    <DragHandleButton
      aria-label={ariaLabel}
      disabled={handleDisabled}
      className={cn(HANDLE_COLOR_CLASS[color], handleClassName)}
      {...attributes}
      {...listeners}
    />
  );

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ handle, isDragging })}
    </div>
  );
}
