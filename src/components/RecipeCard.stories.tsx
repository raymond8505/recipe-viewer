import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import RecipeCard from "./RecipeCard";
import { recipeNutritionBadges } from "./RecipeNutritionBadge";
import { RecipeCategoryBadge } from "./RecipeCategoryBadge";
import { RecipeStatusBadge } from "./RecipeStatusBadge";
import { recipeFixtures, makeRecipe, makeNutritionRecipeRow } from "@/fixtures";

const baseRecipe = recipeFixtures[2]; // Thai Curry Chicken Meatballs

/**
 * The badges a recipe listing hands each card. They are built here rather than
 * derived inside the card on purpose: which badges a card carries is a
 * decision about the listing, and the card only places what it is given.
 */
const categoryBadge = <RecipeCategoryBadge category="Main Course" />;
const nutritionBadges = recipeNutritionBadges(
  makeNutritionRecipeRow("thai-curry", "Thai Curry Chicken Meatballs", {
    calories_kcal: 1400,
    protein_g: 96,
  }),
);

const meta: Meta<typeof RecipeCard> = {
  component: RecipeCard,
  title: "Components/Recipes/RecipeCard",
  parameters: {
    nextjs: { appDirectory: true },
    layout: "fullscreen",
  },
  globals: { viewport: { value: "card" } },
  args: { topBadges: [categoryBadge] },
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

/** Nothing to say beyond the name: no time, and no badges of either kind. */
export const NoTimeOrBadges: Story = {
  args: {
    recipe: makeRecipe("simple-salad", "Simple Salad"),
    topBadges: [],
  },
};

/**
 * Status sits in the same array as the category, so a signed-in listing is
 * just a listing whose top-badge array has one more entry in it. It goes last,
 * always — the overlay packs right, so last is the corner.
 */
export const WithStatusBadge: Story = {
  args: {
    recipe: { ...baseRecipe, status: "draft" },
    topBadges: [categoryBadge, <RecipeStatusBadge key="status" status="draft" />],
  },
};

/** The footer with a caller's badges in it — calories and protein per serving. */
export const WithNutritionBadges: Story = {
  args: { recipe: baseRecipe, badges: nutritionBadges },
};

/** Every slot at once, which is what a signed-in listing of a normalized recipe looks like. */
export const EveryBadge: Story = {
  args: {
    recipe: { ...baseRecipe, status: "draft" },
    topBadges: [categoryBadge, <RecipeStatusBadge key="status" status="draft" />],
    badges: nutritionBadges,
  },
};
