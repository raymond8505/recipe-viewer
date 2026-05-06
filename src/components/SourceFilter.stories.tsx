import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import SourceFilter from "./SourceFilter";

const sources = ["seriouseats.com", "nytcooking.com", "bonappetit.com"];

const meta: Meta<typeof SourceFilter> = {
  component: SourceFilter,
  title: "Components/SourceFilter",
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
  args: { current: "seriouseats.com" },
};
