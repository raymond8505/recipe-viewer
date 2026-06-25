import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { AddTimerButton } from "./AddTimerButton";

const meta: Meta<typeof AddTimerButton> = {
  component: AddTimerButton,
  title: "Components/Buttons/AddTimerButton",
  parameters: { layout: "centered" },
  args: { onClick: fn() },
};

export default meta;

type Story = StoryObj<typeof AddTimerButton>;

// Roomier desktop look (TimerColumn header).
export const Default: Story = {};

// Denser mobile-ribbon look (smaller glyph, tighter padding).
export const Compact: Story = {
  args: { compact: true },
};

export const Disabled: Story = {
  args: { disabled: true },
};
