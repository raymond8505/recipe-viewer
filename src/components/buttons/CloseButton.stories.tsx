import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { CloseButton } from "./CloseButton";

const meta: Meta<typeof CloseButton> = {
  component: CloseButton,
  title: "Components/Buttons/CloseButton",
  parameters: { layout: "centered" },
  args: { onClick: fn() },
};

export default meta;

type Story = StoryObj<typeof CloseButton>;

// Default label — used by the AddTimerModal header.
export const Default: Story = {};

// Context-specific label — the cook-mode header exit.
export const ExitCookingMode: Story = {
  args: { "aria-label": "Exit cooking mode", title: "Exit cooking mode" },
};
