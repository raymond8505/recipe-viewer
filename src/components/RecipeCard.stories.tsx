import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import RecipeCard from "./RecipeCard";
import { recipeFixtures, makeRecipe } from "@/fixtures";

const baseRecipe = recipeFixtures[2]; // Thai Curry Chicken Meatballs

const meta: Meta<typeof RecipeCard> = {
  component: RecipeCard,
  title: "Components/Recipes/RecipeCard",
  parameters: {
    nextjs: { appDirectory: true },
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 300 }}>
        <Story />
      </div>
    ),
  ],
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
