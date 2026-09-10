import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import RecipeCard from "./RecipeCard";
import { recipeNutritionBadges } from "./RecipeNutritionBadge";
import { recipeFixtures, makeRecipe, makeNutritionRecipeRow } from "@/fixtures";

const baseRecipe = recipeFixtures[2]; // Thai Curry Chicken Meatballs

const meta: Meta<typeof RecipeCard> = {
  component: RecipeCard,
  title: "Components/Recipes/RecipeCard",
  parameters: {
    nextjs: { appDirectory: true },
    layout: "fullscreen",
  },
  globals: { viewport: { value: "card" } },
};

export default meta;

type Story = StoryObj<typeof RecipeCard>;

export const WithImage: Story = {
  args: { recipe: baseRecipe },
};

export const NoImage: Story = {
  args: {
    recipe: {
      ...baseRecipe,
      metadata: {
        schema: { ...baseRecipe.metadata.schema, image: undefined },
      },
    },
  },
};

export const NoDescription: Story = {
  args: {
    recipe: {
      ...baseRecipe,
      metadata: {
        schema: {
          ...baseRecipe.metadata.schema,
          description: undefined,
        },
      },
    },
  },
};

export const NoTimeOrCategory: Story = {
  args: {
    recipe: makeRecipe("simple-salad", "Simple Salad"),
  },
};

export const WithStatusBadge: Story = {
  args: { recipe: { ...baseRecipe, status: "draft" }, showStatusBadge: true },
};

/**
 * The footer with a caller's badges in it — here the calories and protein the
 * recipe list passes. Note the wrap: at a card's width, time + category + two
 * nutrients is a second row.
 */
export const WithNutritionBadges: Story = {
  args: {
    recipe: baseRecipe,
    badges: recipeNutritionBadges(
      makeNutritionRecipeRow("thai-curry", "Thai Curry Chicken Meatballs", {
        calories_kcal: 1400,
        protein_g: 96,
      }),
    ),
  },
};
