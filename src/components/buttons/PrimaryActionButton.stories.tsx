import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { PrimaryActionButton } from "./PrimaryActionButton";

const meta: Meta<typeof PrimaryActionButton> = {
  component: PrimaryActionButton,
  title: "Components/Buttons/PrimaryActionButton",
  parameters: { layout: "centered" },
  args: { children: "Save recipe", onClick: fn() },
};

export default meta;

type Story = StoryObj<typeof PrimaryActionButton>;

export const Default: Story = {};

export const Large: Story = { args: { size: "lg", children: "Start timer" } };

export const Disabled: Story = { args: { disabled: true } };

/**
 * `w-full` makes the button stretch to whatever it is dropped into. The meta's
 * centered layout would shrink-wrap it back to its label, so this story alone
 * takes over the canvas to have a width to stretch into.
 */
export const FullWidth: Story = {
  args: { className: "w-full", children: "Let's go" },
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "control" } },
};
