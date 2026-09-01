import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import GroupContainer from "./GroupContainer";
import { toGroupSortId } from "./dragIds";

const meta: Meta<typeof GroupContainer> = {
  component: GroupContainer,
  title: "Components/Recipes/Editor/GroupContainer",
  parameters: { layout: "fullscreen" },
  args: { onHeadingChange: fn(), onDelete: fn() },
  globals: { viewport: { value: "panel" } },
  decorators: [
    (Story, ctx) => (
      <DndContext>
        <SortableContext items={[toGroupSortId(ctx.args.groupId)]}>
          <Story />
        </SortableContext>
      </DndContext>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof GroupContainer>;

const body = (
  <p className="text-sm text-gray-500 px-2 py-3">(group rows render here)</p>
);

export const NamedSection: Story = {
  args: {
    groupId: "g1",
    heading: "Spice blend",
    itemCount: 3,
    itemNoun: "ingredient",
    children: body,
  },
};

/** The ungrouped section (heading null): no handle, heading input, or delete. */
export const UngroupedSection: Story = {
  args: {
    groupId: "g0",
    heading: null,
    itemCount: 2,
    itemNoun: "ingredient",
    onDelete: undefined,
    children: body,
  },
};
