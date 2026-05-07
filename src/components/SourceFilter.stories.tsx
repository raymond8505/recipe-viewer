import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import SourceFilter from "./SourceFilter";
import { sources } from "@/fixtures";

const meta: Meta<typeof SourceFilter> = {
  component: SourceFilter,
  title: "Components/Recipes/SourceFilter",
  parameters: {
    layout: "centered",
    nextjs: { appDirectory: true },
  },
  args: { sources },
};

export default meta;
type Story = StoryObj<typeof SourceFilter>;

export const AllSelected: Story = {
  args: { current: undefined },
};

export const SpecificSourceSelected: Story = {
  args: { current: sources[0] },
};
