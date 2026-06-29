"use client";

import { useState, type ReactNode } from "react";
import { TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DeleteConfirm from "./DeleteConfirm";
import SortableRow from "./SortableRow";
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
  /** Vertical spacing between the group's rows. Defaults to "space-y-1". */
  itemGapClassName?: string;
  /** Tall-card layout (instruction sections): tint the section with a light
   *  background + a bit more padding so sections read as distinct blocks. */
  spacious?: boolean;
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
  itemGapClassName = "space-y-1",
  spacious,
  children,
  disabled,
}: GroupContainerProps) {
  const [confirming, setConfirming] = useState(false);
  const isUngrouped = heading === null;

  return (
    <SortableRow
      id={toGroupSortId(groupId)}
      color="brand"
      // Ungrouped section never drags, but must stay droppable.
      disabled={{ draggable: isUngrouped, droppable: false }}
      className={
        isUngrouped
          ? ""
          : spacious
            ? "rounded-xl border border-gray-200 bg-gray-50 p-2"
            : "rounded-xl border border-gray-200 p-1.5"
      }
    >
      {({ handle }) => (
        <>
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
                {handle({
                  "aria-label": `Reorder section ${heading || "(untitled)"}`,
                  disabled,
                  className: "min-h-[40px] items-center",
                })}
                <Input
                  type="text"
                  value={heading}
                  onChange={(e) => onHeadingChange(e.target.value)}
                  disabled={disabled}
                  placeholder="Group name"
                  aria-label="Group name"
                  className="flex-1 min-w-0 min-h-[40px] text-sm font-semibold uppercase tracking-wide text-brand"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirming(true)}
                  disabled={disabled}
                  className="h-auto w-7 min-h-[40px] shrink-0 rounded-sm text-gray-300 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                  aria-label={`Delete section ${heading || "(untitled)"}`}
                >
                  <TrashIcon />
                </Button>
              </div>
            ))}
          {!confirming && <div className={itemGapClassName}>{children}</div>}
        </>
      )}
    </SortableRow>
  );
}
