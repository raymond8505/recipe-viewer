import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import RecipeGrid from "./RecipeGrid";
import { recipeFixtures, makeNutritionRecipeRow } from "@/fixtures";

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

/** A signed-in listing: status joins the category in each card's overlay. */
export const WithStatusBadges: Story = {
  args: { recipes: recipeFixtures, showStatusBadge: true },
};

/**
 * Nutrition badges are per-recipe, not per-grid: the first card resolves
 * calories and protein from its matched line, and the fixtures beside it —
 * which have no matched lines — carry none. That mix is the normal state of a
 * real listing, not a broken one.
 */
export const WithNutrition: Story = {
  args: {
    recipes: [
      makeNutritionRecipeRow("weeknight-dal", "Weeknight Dal", {
        calories_kcal: 1400,
        protein_g: 96,
      }),
      ...recipeFixtures.slice(0, 2),
    ],
  },
};

export const EmptyState: Story = {
  args: { recipes: [] },
};
