import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import SortBar from "./SortBar";

const meta: Meta<typeof SortBar> = {
  component: SortBar,
  title: "Components/Recipes/SortBar",
  parameters: {
    layout: "centered",
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof SortBar>;

export const DefaultNewest: Story = {
  args: { current: "newest" },
};

export const SortedByOldest: Story = {
  args: { current: "oldest" },
};

export const SortedByNameAsc: Story = {
  args: { current: "name-asc" },
};

export const SortedByNameDesc: Story = {
  args: { current: "name-desc" },
};
