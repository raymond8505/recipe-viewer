"use client";

import { useState, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DragHandleIcon, TrashIcon } from "@/components/icons";
import DeleteConfirm from "./DeleteConfirm";

interface SortableItemProps {
  /** Sortable id — the item's bare nanoid id. */
  id: string;
  /** The editable field(s) for this row. May be a render function that
   *  receives `requestDelete` so the child can place its own delete trigger
   *  (used by the instruction card to put delete in its bottom row). */
  children: ReactNode | ((api: { requestDelete: () => void }) => ReactNode);
  /** Accessible label for the drag handle, e.g. "Reorder 1 tsp cumin". */
  dragLabel: string;
  /** Message shown in the inline delete confirm, e.g. "Delete this ingredient?". */
  confirmMessage: string;
  onDelete: () => void;
  /** Render the default right-rail trash button. Off when the child owns its
   *  own delete trigger via `requestDelete`. Defaults to true. */
  showDeleteButton?: boolean;
  /** Pin the drag handle to the row's top-left instead of stretching it the
   *  full height — for tall card rows (instruction steps). */
  alignHandleTop?: boolean;
  /** Red outline + role flag when the row has a validation error. */
  errored?: boolean;
  disabled?: boolean;
}

/**
 * A draggable, deletable editor row. Wraps its children with a dnd-kit
 * `useSortable` handle (left) and, by default, a trash button (right) that
 * swaps the row for an inline confirm. The handle — not the whole row —
 * carries the drag listeners so the text inputs inside stay fully interactive.
 * Owns the delete-confirm overlay regardless of where the trigger lives.
 */
export default function SortableItem({
  id,
  children,
  dragLabel,
  confirmMessage,
  onDelete,
  showDeleteButton = true,
  alignHandleTop,
  errored,
  disabled,
}: SortableItemProps) {
  const [confirming, setConfirming] = useState(false);
  const requestDelete = () => setConfirming(true);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  if (confirming) {
    return (
      <div ref={setNodeRef} style={style}>
        <DeleteConfirm
          message={confirmMessage}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            onDelete();
            setConfirming(false);
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-0.5 rounded-lg ${errored ? "ring-1 ring-red-300" : ""}`}
    >
      <button
        type="button"
        className={`shrink-0 flex justify-center w-5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 touch-none cursor-grab active:cursor-grabbing disabled:opacity-40 ${
          alignHandleTop
            ? "items-start self-start pt-1"
            : "items-center self-stretch min-h-[40px]"
        }`}
        aria-label={dragLabel}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon />
      </button>
      <div className="flex-1 min-w-0">
        {typeof children === "function" ? children({ requestDelete }) : children}
      </div>
      {showDeleteButton && (
        <button
          type="button"
          onClick={requestDelete}
          disabled={disabled}
          className="shrink-0 flex items-center justify-center w-7 self-stretch min-h-[40px] rounded text-gray-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
          aria-label={confirmMessage}
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}
