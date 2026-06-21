import type { EditableGroup } from "@/types/editor";
import { fromGroupSortId, isGroupSortId } from "./dragIds";

/** Index of the group containing `itemId`, or -1 if no group has it. */
export function findGroupIndexByItem<T extends { id: string }>(
  groups: EditableGroup<T>[],
  itemId: string,
): number {
  return groups.findIndex((g) => g.items.some((it) => it.id === itemId));
}

/** Resolve any dnd sort id (group sort id or item id) to its container group
 *  index. Group sort ids map to their own group; item ids map to the group that
 *  holds them. Returns -1 if unresolvable. */
export function containerIndexOf<T extends { id: string }>(
  groups: EditableGroup<T>[],
  id: string,
): number {
  if (isGroupSortId(id)) {
    const realId = fromGroupSortId(id);
    return groups.findIndex((g) => g.id === realId);
  }
  return findGroupIndexByItem(groups, id);
}
