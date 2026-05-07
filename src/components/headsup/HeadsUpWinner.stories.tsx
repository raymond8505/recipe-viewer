import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, fn } from "storybook/test";
import HeadsUpWinner from "./HeadsUpWinner";
import type { RecipeRow } from "@/types/recipe";

const recipe: RecipeRow = {
  id: "r1",
  url: "https://example.com/pasta-carbonara",
  source: "seriouseats.com",
  status: "published",
  metadata: {
    schema: {
      name: "Pasta Carbonara",
      description: "A classic Italian pasta dish made with eggs, guanciale, and Pecorino Romano.",
      image: "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400",
      totalTime: "PT30M",
      recipeYield: "4 servings",
      nutrition: { calories: "520 kcal" },
      recipeCuisine: "Italian",
    },
  },
};

const meta: Meta<typeof HeadsUpWinner> = {
  component: HeadsUpWinner,
  title: "Components/HeadsUp/HeadsUpWinner",
  parameters: {
    nextjs: { appDirectory: true },
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", background: "#111827" }}>
        <Story />
      </div>
    ),
  ],
  args: { onPlayAgain: fn() },
};

export default meta;
type Story = StoryObj<typeof HeadsUpWinner>;

export const WithWinner: Story = {
  args: { recipe },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /play again/i }));
  },
};

export const WinnerNoImage: Story = {
  args: {
    recipe: {
      ...recipe,
      metadata: { schema: { ...recipe.metadata.schema, image: undefined } },
    },
  },
};
