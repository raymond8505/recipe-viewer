import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import SortableRow from "./SortableRow";

/** SortableRow must live inside a DndContext + SortableContext to register. */
const meta: Meta<typeof SortableRow> = {
  component: SortableRow,
  title: "Components/Recipes/Editor/SortableRow",
  parameters: { layout: "padded" },
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
type Story = StoryObj<typeof SortableRow>;

const sampleContent = (
  <span className="flex-1 min-w-0 text-sm text-gray-700">1 tsp cumin</span>
);

/** Neutral palette — the ingredient/instruction row handle. */
export const Neutral: Story = {
  args: {
    id: "row-1",
    color: "neutral",
    className: "flex items-center gap-0.5 rounded-lg",
    children: ({ handle }) => (
      <>
        {handle({
          "aria-label": "Reorder 1 tsp cumin",
          className: "items-center self-stretch min-h-[40px]",
        })}
        {sampleContent}
      </>
    ),
  },
};

/** Brand palette — the section-header handle. */
export const Brand: Story = {
  args: {
    id: "row-2",
    color: "brand",
    className: "flex items-center gap-0.5 rounded-lg",
    children: ({ handle }) => (
      <>
        {handle({
          "aria-label": "Reorder section Sauce",
          className: "items-center min-h-[40px]",
        })}
        <span className="flex-1 min-w-0 text-sm font-semibold uppercase tracking-wide text-orange-600">
          Sauce
        </span>
      </>
    ),
  },
};
