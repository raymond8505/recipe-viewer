import { describe, it, expect } from "vitest";
import {
  containerIndexOf,
  findGroupIndexByItem,
} from "@/components/editor/groupHelpers";
import { toGroupSortId } from "@/components/editor/dragIds";
import type { EditableGroup } from "@/types/editor";

type Item = { id: string };

const groups: EditableGroup<Item>[] = [
  { id: "g0", heading: null, items: [{ id: "a" }, { id: "b" }] },
  { id: "g1", heading: "Sauce", items: [{ id: "c" }] },
  { id: "g2", heading: "Empty", items: [] },
];

describe("findGroupIndexByItem", () => {
  it("returns the index of the group holding the item", () => {
    expect(findGroupIndexByItem(groups, "a")).toBe(0);
    expect(findGroupIndexByItem(groups, "b")).toBe(0);
    expect(findGroupIndexByItem(groups, "c")).toBe(1);
  });

  it("returns -1 when no group holds the item", () => {
    expect(findGroupIndexByItem(groups, "missing")).toBe(-1);
  });
});

describe("containerIndexOf", () => {
  it("resolves an item id to its container group index", () => {
    expect(containerIndexOf(groups, "a")).toBe(0);
    expect(containerIndexOf(groups, "c")).toBe(1);
  });

  it("resolves a group sort id to that group's index", () => {
    expect(containerIndexOf(groups, toGroupSortId("g1"))).toBe(1);
    expect(containerIndexOf(groups, toGroupSortId("g2"))).toBe(2);
  });

  it("returns -1 for an unknown item id", () => {
    expect(containerIndexOf(groups, "missing")).toBe(-1);
  });

  it("returns -1 for a group sort id with no matching group", () => {
    expect(containerIndexOf(groups, toGroupSortId("nope"))).toBe(-1);
  });
});
