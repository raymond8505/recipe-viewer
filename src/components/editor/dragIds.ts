/**
 * dnd-kit sortable id namespacing for the grouped editor.
 *
 * Item rows use their bare `nanoid` id as the sortable id; groups use a
 * `group:`-prefixed id. The prefix is how the drag handlers tell a group drag
 * (reorder groups) from an item drag (reorder / move between groups) — the
 * disambiguation is on the ACTIVE id, so a group container and an item can both
 * be valid drop targets without collision.
 */
const GROUP_PREFIX = "group:";

export function toGroupSortId(groupId: string): string {
  return `${GROUP_PREFIX}${groupId}`;
}

export function isGroupSortId(id: string): boolean {
  return id.startsWith(GROUP_PREFIX);
}

export function fromGroupSortId(id: string): string {
  return id.slice(GROUP_PREFIX.length);
}
