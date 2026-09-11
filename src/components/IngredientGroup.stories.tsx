import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import IngredientGroup from "./IngredientGroup";
import { makeScalableRecipe } from "@/fixtures";

// scalableBaseIngredients: [0] four nameless lines, [1] the "Wet" group.
const [nameless, wet] = makeScalableRecipe().groupedIngredients;

const meta: Meta<typeof IngredientGroup> = {
  component: IngredientGroup,
  title: "Components/Recipes/IngredientGroup",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "card" } },
  // Rows carry a negative inline margin; the padding gives them room to bleed into.
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    group: wet,
    isSelected: () => false,
    onToggle: fn(),
    onAnchor: fn(),
    headingClassName: "text-xs",
    itemClassName: "text-sm",
  },
};

export default meta;
type Story = StoryObj<typeof IngredientGroup>;

export const Named: Story = {};

// The nameless group renders no heading.
export const Nameless: Story = {
  args: { group: nameless },
};

// One line already on the shopping list.
export const WithSelection: Story = {
  args: { isSelected: (ing) => ing.original === "1 cup butter" },
};

// The larger touch-first heading and row text cooking mode passes.
export const LargeTouchSizing: Story = {
  args: { headingClassName: "text-sm sm:text-xs", itemClassName: "text-lg sm:text-sm" },
  globals: { viewport: { value: "column" } },
};
