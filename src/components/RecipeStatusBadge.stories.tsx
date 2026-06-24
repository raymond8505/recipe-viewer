import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RecipeStatusBadge } from "./RecipeStatusBadge";

const meta: Meta<typeof RecipeStatusBadge> = {
  component: RecipeStatusBadge,
  title: "Components/Recipes/RecipeStatusBadge",
  parameters: {
    layout: "centered",
  },
};

export default meta;

type Story = StoryObj<typeof RecipeStatusBadge>;

export const Published: Story = {
  args: { status: "published" },
};

export const Draft: Story = {
  args: { status: "draft" },
};

export const Archived: Story = {
  args: { status: "archived" },
};

// `null` status is normalized to "draft" — same as the Draft story visually.
export const NullDefaultsToDraft: Story = {
  args: { status: null },
};
