"use client";

import { useState, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DragHandleIcon, TrashIcon } from "@/components/icons";
import DeleteConfirm from "./DeleteConfirm";
import { toGroupSortId } from "./dragIds";

interface GroupContainerProps {
  /** The group's bare id (this component derives the `group:` sortable id). */
  groupId: string;
  /** null → the ungrouped/top-level section: no handle, heading, or delete,
   *  but still a drop target so items can be moved out of named groups. */
  heading: string | null;
  onHeadingChange: (heading: string) => void;
  /** Undefined for the null group (not deletable). */
  onDelete?: () => void;
  /** Number of items — surfaced in the group delete confirm message. */
  itemCount: number;
  itemNoun: string;
  children: ReactNode;
  disabled?: boolean;
}

/**
 * A draggable group of editor rows. Dragging the group's handle reorders the
 * whole group (its items ride along because they live inside the group object).
 * The outer node is the dnd-kit droppable, so items can be dropped anywhere in
 * the group — including an empty one. The null group is droppable but not
 * draggable.
 */
export default function GroupContainer({
  groupId,
  heading,
  onHeadingChange,
  onDelete,
  itemCount,
  itemNoun,
  children,
  disabled,
}: GroupContainerProps) {
  const [confirming, setConfirming] = useState(false);
  const isUngrouped = heading === null;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: toGroupSortId(groupId),
    // Ungrouped section never drags, but must stay droppable.
    disabled: { draggable: isUngrouped, droppable: false },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isUngrouped ? "" : "rounded-xl border border-gray-200 p-1.5"}
    >
      {!isUngrouped &&
        (confirming ? (
          <DeleteConfirm
            message={`Delete “${heading || "this section"}” and its ${itemCount} ${itemNoun}${itemCount === 1 ? "" : "s"}?`}
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              onDelete?.();
              setConfirming(false);
            }}
          />
        ) : (
          <div className="flex items-stretch gap-0.5 mb-2">
            <button
              type="button"
              className="shrink-0 flex items-center justify-center w-5 min-h-[40px] rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 touch-none cursor-grab active:cursor-grabbing disabled:opacity-40"
              aria-label={`Reorder section ${heading || "(untitled)"}`}
              disabled={disabled}
              {...attributes}
              {...listeners}
            >
              <DragHandleIcon />
            </button>
            <input
              type="text"
              value={heading}
              onChange={(e) => onHeadingChange(e.target.value)}
              disabled={disabled}
              placeholder="Group name"
              aria-label="Group name"
              className="flex-1 min-w-0 min-h-[40px] rounded-lg border border-gray-200 px-2 text-sm font-semibold uppercase tracking-wide text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={disabled}
              className="shrink-0 flex items-center justify-center w-7 min-h-[40px] rounded text-gray-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
              aria-label={`Delete section ${heading || "(untitled)"}`}
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      {!confirming && <div className="space-y-1">{children}</div>}
    </div>
  );
}
