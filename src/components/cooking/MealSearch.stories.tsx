import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import MealSearch from "./MealSearch";

const meta: Meta<typeof MealSearch> = {
  component: MealSearch,
  title: "Components/Cooking Mode/MealSearch",
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Search your saved recipes to add to the current meal session. Try searching for "tomatillo", "meatball", or "oat" to see results.",
      },
    },
  },
  args: {
    excludeIds: new Set<string>(),
    onAdd: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof MealSearch>;

export const Default: Story = {};
