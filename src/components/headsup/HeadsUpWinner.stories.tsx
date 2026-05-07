import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, fn } from "storybook/test";
import HeadsUpWinner from "./HeadsUpWinner";
import { recipeFixtures } from "@/fixtures";

const recipe = recipeFixtures[2]; // Thai Curry Chicken Meatballs

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
