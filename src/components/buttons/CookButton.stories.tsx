import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { CookButton } from "./CookButton";

const meta: Meta<typeof CookButton> = {
  component: CookButton,
  title: "Components/Buttons/CookButton",
  parameters: { layout: "centered" },
  args: { onClick: fn() },
};

export default meta;

type Story = StoryObj<typeof CookButton>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};
