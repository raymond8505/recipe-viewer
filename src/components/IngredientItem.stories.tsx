import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, fn } from "storybook/test";
import IngredientItem from "./IngredientItem";

const meta: Meta<typeof IngredientItem> = {
  component: IngredientItem,
  title: "Components/Recipes/IngredientItem",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <ul className="list-disc pl-6 text-gray-800 text-base">
        <li>
          <Story />
        </li>
      </ul>
    ),
  ],
  args: { onScaleChange: fn() },
};

export default meta;
type Story = StoryObj<typeof IngredientItem>;

// Amount is a clickable button; unit select is visible (cups ↔ ml, etc.)
export const Default: Story = {
  args: { ingredient: "2 cups flour", scale: 1 },
};

// No onScaleChange → amount renders as plain <span>, no unit select
export const ReadOnly: Story = {
  args: { ingredient: "2 cups flour", scale: 1, onScaleChange: undefined },
};

// scale=2 means 2 cups × 2 = 4 cups displayed
export const Scaled: Story = {
  args: { ingredient: "2 cups flour", scale: 2 },
};

// Ingredient without a parseable unit (no unit select rendered)
export const NoUnit: Story = {
  args: { ingredient: "3 cloves garlic", scale: 1 },
};

// Ingredient that cannot be parsed at all → renders as plain text
export const Unparseable: Story = {
  args: { ingredient: "a handful of fresh herbs", scale: 1 },
};

export const EditingAmount: Story = {
  parameters: {
    docs: { description: { story: "Clicking the amount button reveals an editable number input." } },
  },
  args: { ingredient: "2 cups flour", scale: 1 },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /edit amount/i }));
  },
};
