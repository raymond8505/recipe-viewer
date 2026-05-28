import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import RecipeDetail from "./RecipeDetail";
import { recipeFixtures, makeRecipe } from "@/fixtures";

const baseRecipe = recipeFixtures[2]; // Thai Curry Chicken Meatballs — full schema with ingredients/instructions/notes

const meta: Meta<typeof RecipeDetail> = {
  component: RecipeDetail,
  title: "Components/Recipes/RecipeDetail",
  parameters: {
    nextjs: { appDirectory: true },
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="p-6 sm:p-10">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof RecipeDetail>;

export const Default: Story = {
  args: { recipe: baseRecipe },
};

export const LoggedIn: Story = {
  args: { recipe: baseRecipe, isLoggedIn: true },
};

export const Draft: Story = {
  args: {
    recipe: { ...baseRecipe, status: "draft" },
    isLoggedIn: true,
  },
};

export const Minimal: Story = {
  args: { recipe: makeRecipe("simple-bowl", "Simple Bowl") },
};
