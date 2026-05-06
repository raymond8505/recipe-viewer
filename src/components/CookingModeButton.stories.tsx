import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CookingModeButton from "./CookingModeButton";
import type { RecipeRow } from "@/types/recipe";

const baseRecipe: RecipeRow = {
  id: "1",
  url: "https://example.com/pasta-carbonara",
  source: "example.com",
  status: "published",
  metadata: {
    schema: {
      name: "Pasta Carbonara",
      description: "A classic Italian pasta dish.",
      image: "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400",
      totalTime: "PT30M",
      recipeCategory: "Italian",
    },
  },
};

const meta: Meta<typeof CookingModeButton> = {
  component: CookingModeButton,
  title: "Components/CookingModeButton",
  parameters: {
    layout: "centered",
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof CookingModeButton>;

// Do not interact with the button in play functions — clicking opens CookingMode
// which requires Supabase and complex context.

export const LoggedIn: Story = {
  args: { recipe: baseRecipe, isLoggedIn: true },
};

export const GuestUser: Story = {
  args: { recipe: baseRecipe, isLoggedIn: false },
};
