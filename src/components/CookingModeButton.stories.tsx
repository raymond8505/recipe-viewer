import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CookingModeButton from "./CookingModeButton";
import { recipeFixtures } from "@/fixtures";

const meta: Meta<typeof CookingModeButton> = {
  component: CookingModeButton,
  title: "Components/Recipes/CookingModeButton",
  parameters: {
    layout: "centered",
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof CookingModeButton>;

// Do not interact with the button in play functions — clicking opens CookingMode
// which requires Supabase and complex context.

export const Default: Story = {
  args: { recipe: recipeFixtures[0], isLoggedIn: true },
};
