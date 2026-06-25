"use client";

import { useState, type ReactNode } from "react";
import { TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import DeleteConfirm from "./DeleteConfirm";
import SortableRow from "./SortableRow";

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

  return (
    <SortableRow
      id={id}
      color="neutral"
      disabled={disabled}
      className={
        confirming
          ? ""
          : `flex items-start gap-0.5 rounded-lg ${errored ? "ring-1 ring-red-300" : ""}`
      }
    >
      {({ handle }) =>
        confirming ? (
          <DeleteConfirm
            message={confirmMessage}
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              onDelete();
              setConfirming(false);
            }}
          />
        ) : (
          <>
            {handle({
              "aria-label": dragLabel,
              disabled,
              className: alignHandleTop
                ? "rounded items-start self-start pt-1"
                : "rounded items-center self-stretch min-h-[40px]",
            })}
            <div className="flex-1 min-w-0">
              {typeof children === "function"
                ? children({ requestDelete })
                : children}
            </div>
            {showDeleteButton && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={requestDelete}
                disabled={disabled}
                className="h-auto w-7 min-h-[40px] shrink-0 self-stretch rounded-sm text-gray-300 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                aria-label={confirmMessage}
              >
                <TrashIcon />
              </Button>
            )}
          </>
        )
      }
    </SortableRow>
  );
}
