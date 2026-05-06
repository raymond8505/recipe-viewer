import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import RecipeGrid from "./RecipeGrid";
import type { RecipeRow } from "@/types/recipe";

const makeRecipe = (id: string, name: string, image?: string): RecipeRow => ({
  id,
  url: `https://example.com/${id}`,
  source: "example.com",
  status: "published",
  metadata: {
    schema: {
      name,
      description: "A delicious recipe worth trying.",
      image,
      totalTime: "PT30M",
      recipeCategory: "Main",
    },
  },
});

const recipes = [
  makeRecipe(
    "1",
    "Pasta Carbonara",
    "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400",
  ),
  makeRecipe("2", "Chicken Tikka Masala"),
  makeRecipe(
    "3",
    "Beef Tacos",
    "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400",
  ),
];

const meta: Meta<typeof RecipeGrid> = {
  component: RecipeGrid,
  title: "Components/RecipeGrid",
  parameters: { nextjs: { appDirectory: true } },
};

export default meta;
type Story = StoryObj<typeof RecipeGrid>;

export const WithRecipes: Story = {
  args: { recipes },
};

export const WithStatusBadges: Story = {
  args: { recipes, showStatusBadge: true },
};

export const EmptyState: Story = {
  args: { recipes: [] },
};
