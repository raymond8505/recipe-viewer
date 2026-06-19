"use client";

import { useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { nanoid } from "nanoid";
import type { EditableGroup } from "@/types/editor";
import GroupContainer from "./GroupContainer";
import SortableItem from "./SortableItem";
import AddRowButton from "./AddRowButton";
import { fromGroupSortId, isGroupSortId, toGroupSortId } from "./dragIds";

interface SortableGroupedListProps<T extends { id: string }> {
  groups: EditableGroup<T>[];
  onChange: (groups: EditableGroup<T>[]) => void;
  /** Render the editable field(s) for one row. `update` patches that item;
   *  `requestDelete` opens the delete confirm (for rows that place their own
   *  delete trigger instead of the default right-rail one). */
  renderItem: (
    item: T,
    update: (partial: Partial<T>) => void,
    errored: boolean,
    requestDelete: () => void,
  ) => ReactNode;
  /** Hide the default right-rail trash and let `renderItem` place delete via
   *  `requestDelete` (instruction cards put it in their bottom row). */
  rowDeleteInline?: boolean;
  /** Factory for a new blank item. */
  makeItem: () => T;
  /** Short display text for the row, used in drag/delete a11y labels. */
  itemLabel: (item: T) => string;
  /** Singular noun: "ingredient" / "step". */
  itemNoun: string;
  /** Singular noun for a group: "group" / "section". */
  groupNoun: string;
  /** Item ids with a validation error (highlighted). */
  erroredItemIds?: Set<string>;
  disabled?: boolean;
}

function findGroupIndexByItem<T extends { id: string }>(
  groups: EditableGroup<T>[],
  itemId: string,
): number {
  return groups.findIndex((g) => g.items.some((it) => it.id === itemId));
}

function containerIndexOf<T extends { id: string }>(
  groups: EditableGroup<T>[],
  id: string,
): number {
  if (isGroupSortId(id)) {
    const realId = fromGroupSortId(id);
    return groups.findIndex((g) => g.id === realId);
  }
  return findGroupIndexByItem(groups, id);
}

/**
 * The shared drag-and-drop engine for the grouped recipe editors. Owns the
 * `DndContext` and all reorder/move/add/delete logic over `EditableGroup<T>[]`;
 * ingredient and instruction editors are thin wrappers that supply render props
 * and factories. See `dragIds.ts` for the group/item id disambiguation.
 */
export default function SortableGroupedList<T extends { id: string }>({
  groups,
  onChange,
  renderItem,
  makeItem,
  itemLabel,
  itemNoun,
  groupNoun,
  erroredItemIds,
  rowDeleteInline,
  disabled,
}: SortableGroupedListProps<T>) {
  const [, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const updateItem = (groupId: string, itemId: string, partial: Partial<T>) =>
    onChange(
      groups.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              items: g.items.map((it) =>
                it.id === itemId ? { ...it, ...partial } : it,
              ),
            },
      ),
    );

  const deleteItem = (groupId: string, itemId: string) =>
    onChange(
      groups.map((g) =>
        g.id !== groupId
          ? g
          : { ...g, items: g.items.filter((it) => it.id !== itemId) },
      ),
    );

  const addItemToGroup = (groupId: string) =>
    onChange(
      groups.map((g) =>
        g.id !== groupId ? g : { ...g, items: [...g.items, makeItem()] },
      ),
    );

  const addItemToList = () => {
    const nullIdx = groups.findIndex((g) => g.heading === null);
    if (nullIdx === -1) {
      onChange([...groups, { id: nanoid(), heading: null, items: [makeItem()] }]);
    } else {
      onChange(
        groups.map((g, i) =>
          i !== nullIdx ? g : { ...g, items: [...g.items, makeItem()] },
        ),
      );
    }
  };

  const addGroup = () =>
    onChange([...groups, { id: nanoid(), heading: "", items: [] }]);

  const deleteGroup = (groupId: string) =>
    onChange(groups.filter((g) => g.id !== groupId));

  const setHeading = (groupId: string, heading: string) =>
    onChange(groups.map((g) => (g.id !== groupId ? g : { ...g, heading })));

  // Cross-group item moves happen live during the drag (dnd-kit pattern).
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || isGroupSortId(String(active.id))) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const fromIdx = findGroupIndexByItem(groups, activeId);
    const toIdx = containerIndexOf(groups, overId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

    const next = groups.map((g) => ({ ...g, items: [...g.items] }));
    const removeAt = next[fromIdx].items.findIndex((it) => it.id === activeId);
    if (removeAt === -1) return;
    const [moved] = next[fromIdx].items.splice(removeAt, 1);
    let insertAt = isGroupSortId(overId)
      ? next[toIdx].items.length
      : next[toIdx].items.findIndex((it) => it.id === overId);
    if (insertAt < 0) insertAt = next[toIdx].items.length;
    next[toIdx].items.splice(insertAt, 0, moved);
    onChange(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (isGroupSortId(activeId)) {
      if (!isGroupSortId(overId)) return;
      const from = groups.findIndex((g) => g.id === fromGroupSortId(activeId));
      const to = groups.findIndex((g) => g.id === fromGroupSortId(overId));
      if (from !== -1 && to !== -1 && from !== to) {
        onChange(arrayMove(groups, from, to));
      }
      return;
    }

    // Item: finalize same-group reorder (cross-group already done in dragOver).
    const gIdx = findGroupIndexByItem(groups, activeId);
    if (gIdx === -1 || isGroupSortId(overId)) return;
    if (containerIndexOf(groups, overId) !== gIdx) return;
    const from = groups[gIdx].items.findIndex((it) => it.id === activeId);
    const to = groups[gIdx].items.findIndex((it) => it.id === overId);
    if (from !== -1 && to !== -1 && from !== to) {
      onChange(
        groups.map((g, i) =>
          i !== gIdx ? g : { ...g, items: arrayMove(g.items, from, to) },
        ),
      );
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="space-y-3">
        <SortableContext
          items={groups.map((g) => toGroupSortId(g.id))}
          strategy={verticalListSortingStrategy}
        >
          {groups.map((group) => (
            <GroupContainer
              key={group.id}
              groupId={group.id}
              heading={group.heading}
              onHeadingChange={(h) => setHeading(group.id, h)}
              onDelete={
                group.heading === null
                  ? undefined
                  : () => deleteGroup(group.id)
              }
              itemCount={group.items.length}
              itemNoun={itemNoun}
              disabled={disabled}
            >
              <SortableContext
                items={group.items.map((it) => it.id)}
                strategy={verticalListSortingStrategy}
              >
                {group.items.map((item) => (
                  <SortableItem
                    key={item.id}
                    id={item.id}
                    dragLabel={`Reorder ${itemLabel(item) || itemNoun}`}
                    confirmMessage={`Delete this ${itemNoun}?`}
                    onDelete={() => deleteItem(group.id, item.id)}
                    showDeleteButton={!rowDeleteInline}
                    errored={erroredItemIds?.has(item.id)}
                    disabled={disabled}
                  >
                    {({ requestDelete }) =>
                      renderItem(
                        item,
                        (partial) => updateItem(group.id, item.id, partial),
                        erroredItemIds?.has(item.id) ?? false,
                        requestDelete,
                      )
                    }
                  </SortableItem>
                ))}
              </SortableContext>
              {group.heading !== null && (
                <div className="mt-2">
                  <AddRowButton
                    label={`Add ${itemNoun}`}
                    onClick={() => addItemToGroup(group.id)}
                    disabled={disabled}
                  />
                </div>
              )}
            </GroupContainer>
          ))}
        </SortableContext>

        <div className="flex flex-col gap-2 pt-1">
          <AddRowButton
            label={`Add ${itemNoun}`}
            onClick={addItemToList}
            disabled={disabled}
          />
          <AddRowButton
            label={`Add ${groupNoun}`}
            onClick={addGroup}
            disabled={disabled}
          />
        </div>
      </div>
    </DndContext>
  );
}
