import type { Meta, StoryObj } from "@storybook/react";
import RecipeCard from "./RecipeCard";
import type { RecipeRow } from "@/types/recipe";

const baseRecipe: RecipeRow = {
  id: "1",
  url: "https://example.com/pasta-carbonara",
  source: "example.com",
  status: "published",
  metadata: {
    schema: {
      name: "Pasta Carbonara",
      description:
        "A classic Italian pasta dish made with eggs, Pecorino Romano, guanciale, and black pepper.",
      image: "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400",
      totalTime: "PT30M",
      recipeCategory: "Italian",
    },
  },
};

const meta: Meta<typeof RecipeCard> = {
  component: RecipeCard,
  title: "Components/RecipeCard",
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
    recipe: {
      ...baseRecipe,
      metadata: {
        schema: {
          name: "Simple Salad",
          image: undefined,
        },
      },
    },
  },
};
