import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RecipeCategoryBadge } from "./RecipeCategoryBadge";

const meta: Meta<typeof RecipeCategoryBadge> = {
  component: RecipeCategoryBadge,
  title: "Components/Recipes/RecipeCategoryBadge",
  parameters: {
    layout: "centered",
  },
};

export default meta;

type Story = StoryObj<typeof RecipeCategoryBadge>;

export const Default: Story = {
  args: { category: "Dessert" },
};

// Badge clips overflow with whitespace-nowrap — long labels are truncated.
export const LongLabel: Story = {
  args: { category: "Slow Cooker Comfort Food" },
};
