import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import IngredientList from "./IngredientList";
import { makeScalableRecipe, recipeFixtures } from "@/fixtures";

const meta: Meta<typeof IngredientList> = {
  component: IngredientList,
  title: "Components/Recipes/IngredientList",
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
    // Four nameless lines, then a "Wet" group.
    groups: makeScalableRecipe().groupedIngredients,
    isSelected: () => false,
    onToggle: fn(),
    onAnchor: fn(),
    headingClassName: "text-xs",
    itemClassName: "text-sm",
  },
};

export default meta;
type Story = StoryObj<typeof IngredientList>;

export const Default: Story = {};

// The larger touch-first heading and row text cooking mode passes.
export const LargeTouchSizing: Story = {
  args: { headingClassName: "text-sm sm:text-xs", itemClassName: "text-lg sm:text-sm" },
  globals: { viewport: { value: "column" } },
};

// The recipe at 2× — every amount doubles.
export const Scaled: Story = {
  args: { groups: makeScalableRecipe({}, { ingredientScale: 2 }).groupedIngredients },
};

// A real production recipe with three named ingredient groups.
export const RealRecipe: Story = {
  args: {
    groups: makeScalableRecipe({ ingredients: recipeFixtures[2].ingredients }).groupedIngredients,
  },
};
