import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RecipeNutritionBadge } from "./RecipeNutritionBadge";

/**
 * The pill a recipe card carries a nutrient on. Neutral surface colors on
 * purpose: it sits beside `RecipeCategoryBadge`'s brand accent, and a card
 * with two competing accents reads as two competing claims.
 *
 * Values are always per serving. The card has no room to say so, so the badge
 * carries the basis in its tooltip.
 */
const meta: Meta<typeof RecipeNutritionBadge> = {
  component: RecipeNutritionBadge,
  title: "Components/Recipes/RecipeNutritionBadge",
};

export default meta;
type Story = StoryObj<typeof RecipeNutritionBadge>;

/** Calories carries no label — "kcal" already names the nutrient. */
export const Calories: Story = {
  args: { field: "calories", value: { value: 350, unit: "kcal" } },
};

/** Every other nutrient is named, or the number means nothing. */
export const Protein: Story = {
  args: { field: "proteinContent", value: { value: 24, unit: "g" } },
};

/** The longest label the map holds, for the width a card footer has to absorb. */
export const Cholesterol: Story = {
  args: { field: "cholesterolContent", value: { value: 85, unit: "mg" } },
};

/** Sub-1 values keep two decimals, where larger ones round to whole units. */
export const FractionalValue: Story = {
  args: { field: "fiberContent", value: { value: 0.45, unit: "g" } },
};
