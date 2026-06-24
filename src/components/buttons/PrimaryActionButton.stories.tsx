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

export const FullWidth: Story = {
  args: { className: "w-full", children: "Let's go" },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
};
