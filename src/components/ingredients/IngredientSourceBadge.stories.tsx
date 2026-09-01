import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import IngredientSourceBadge from "./IngredientSourceBadge";

const meta: Meta<typeof IngredientSourceBadge> = {
  component: IngredientSourceBadge,
  title: "Components/Ingredients/IngredientSourceBadge",
};

export default meta;
type Story = StoryObj<typeof IngredientSourceBadge>;

/**
 * USDA-sourced rows carry their FoodData Central id — the key used to
 * re-fetch fuller data later.
 */
export const Usda: Story = {
  args: { source: "usda", fdcId: 170923 },
};

/** Hand-entered rows have no external provenance. */
export const Manual: Story = {
  args: { source: "manual", fdcId: null },
};
