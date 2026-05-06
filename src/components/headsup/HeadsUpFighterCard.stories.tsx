import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, fn } from "storybook/test";
import HeadsUpFighterCard from "./HeadsUpFighterCard";
import { recipeFixtures } from "@/fixtures";

const recipe = recipeFixtures[2]; // Thai Curry Chicken Meatballs

const meta: Meta<typeof HeadsUpFighterCard> = {
  component: HeadsUpFighterCard,
  title: "Components/HeadsUp/HeadsUpFighterCard",
  parameters: {
    layout: "centered",
    nextjs: { appDirectory: true },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 300, background: "#111827", padding: 16, borderRadius: 12 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    recipe,
    position: "left",
    isSelected: false,
    isConfirmed: false,
    onClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof HeadsUpFighterCard>;

export const Default: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onClick).toHaveBeenCalled();
  },
};

export const Selected: Story = {
  args: { isSelected: true },
};

export const Confirmed: Story = {
  args: { isSelected: true, isConfirmed: true },
};

export const RightPosition: Story = {
  args: { position: "right" },
};

export const NoImage: Story = {
  args: {
    recipe: {
      ...recipe,
      metadata: { schema: { ...recipe.metadata.schema, image: undefined } },
    },
  },
};

export const NoStats: Story = {
  args: {
    recipe: {
      ...recipe,
      metadata: { schema: { name: "Simple Salad" } },
    },
  },
};
