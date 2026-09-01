import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import NutritionSourceBadge from "./NutritionSourceBadge";

const meta: Meta<typeof NutritionSourceBadge> = {
  component: NutritionSourceBadge,
  title: "Components/Ingredients/NutritionSourceBadge",
};

export default meta;
type Story = StoryObj<typeof NutritionSourceBadge>;

/**
 * The value was computed from the recipe's normalized ingredient list — the
 * preferred source when every line is fully covered.
 */
export const FromIngredients: Story = {
  args: { source: "normalized" },
};

/**
 * The value fell back to the recipe's own hand-entered/scraped nutrition field
 * (the ingredients didn't supply this nutrient, or the recipe isn't fully
 * covered).
 */
export const FromRecipe: Story = {
  args: { source: "recipe" },
};
