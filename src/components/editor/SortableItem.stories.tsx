import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import SortableItem from "./SortableItem";

/** SortableItem must live inside a DndContext + SortableContext to register. */
const meta: Meta<typeof SortableItem> = {
  component: SortableItem,
  title: "Components/Recipes/Editor/SortableItem",
  parameters: { layout: "padded" },
  args: { onDelete: fn() },
  decorators: [
    (Story, ctx) => (
      <div style={{ maxWidth: 420 }}>
        <DndContext>
          <SortableContext items={[ctx.args.id]}>
            <Story />
          </SortableContext>
        </DndContext>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SortableItem>;

const ingredientInput = (
  <input
    aria-label="Ingredient"
    defaultValue="1 tsp cumin"
    className="w-full min-h-[44px] rounded-lg border border-gray-200 px-3 text-sm text-gray-700"
  />
);

export const Default: Story = {
  args: {
    id: "i1",
    dragLabel: "Reorder 1 tsp cumin",
    confirmMessage: "Delete this ingredient?",
    children: ingredientInput,
  },
};

export const Errored: Story = {
  args: {
    id: "i1",
    dragLabel: "Reorder 1 tsp cumin",
    confirmMessage: "Delete this ingredient?",
    errored: true,
    children: ingredientInput,
  },
};
