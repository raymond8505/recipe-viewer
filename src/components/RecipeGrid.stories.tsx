import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import RecipeGrid from "./RecipeGrid";
import { recipeFixtures } from "@/fixtures";

const meta: Meta<typeof RecipeGrid> = {
  component: RecipeGrid,
  title: "Components/Recipes/RecipeGrid",
  parameters: { nextjs: { appDirectory: true } },
};

export default meta;
type Story = StoryObj<typeof RecipeGrid>;

export const WithRecipes: Story = {
  args: { recipes: recipeFixtures },
};

export const EmptyState: Story = {
  args: { recipes: [] },
};
