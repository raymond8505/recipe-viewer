import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import HeadsUpButton from "./HeadsUpButton";

const meta: Meta<typeof HeadsUpButton> = {
  component: HeadsUpButton,
  title: "Components/HeadsUp/HeadsUpButton",
  parameters: {
    layout: "centered",
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof HeadsUpButton>;

export const Default: Story = {};
