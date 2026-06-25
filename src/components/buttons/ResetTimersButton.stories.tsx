import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { ResetTimersButton } from "./ResetTimersButton";

const meta: Meta<typeof ResetTimersButton> = {
  component: ResetTimersButton,
  title: "Components/Buttons/ResetTimersButton",
  parameters: { layout: "centered" },
  args: { onClick: fn() },
};

export default meta;

type Story = StoryObj<typeof ResetTimersButton>;

export const Default: Story = {
  args: { className: "px-3 py-3" },
};
