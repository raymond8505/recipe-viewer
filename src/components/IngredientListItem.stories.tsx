import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import IngredientListItem from "./IngredientListItem";
import { makeScaledIngredient } from "@/fixtures";

const meta: Meta<typeof IngredientListItem> = {
  component: IngredientListItem,
  title: "Components/Recipes/IngredientListItem",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "card" } },
  // The row is an <li> with a negative inline margin — give it a list and room to bleed into.
  decorators: [
    (Story) => (
      <ul className="p-4">
        <Story />
      </ul>
    ),
  ],
  args: {
    ingredient: makeScaledIngredient("2 cups flour"),
    selected: false,
    onToggle: fn(),
    onAnchor: fn(),
    className: "text-sm",
  },
};

export default meta;
type Story = StoryObj<typeof IngredientListItem>;

export const Default: Story = {};

// On the shopping list: tinted row, green dot.
export const Selected: Story = {
  args: { selected: true },
};

// The larger touch-first text cooking mode passes.
export const LargeTouchSizing: Story = {
  args: { className: "text-lg sm:text-sm" },
  globals: { viewport: { value: "column" } },
};

// No onAnchor → the amount is plain text, not an edit button.
export const ReadOnlyAmount: Story = {
  args: { onAnchor: undefined },
};

// An unparseable line renders as its raw text.
export const Unparseable: Story = {
  args: { ingredient: makeScaledIngredient("salt to taste") },
};
