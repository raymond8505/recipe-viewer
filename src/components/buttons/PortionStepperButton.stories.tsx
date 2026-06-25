import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { PortionStepperButton } from "./PortionStepperButton";

const meta: Meta<typeof PortionStepperButton> = {
  component: PortionStepperButton,
  title: "Components/Buttons/PortionStepperButton",
  parameters: { layout: "centered" },
  args: { onClick: fn() },
};

export default meta;

type Story = StoryObj<typeof PortionStepperButton>;

export const Increase: Story = {
  args: { direction: "increase", "aria-label": "Increase servings" },
};

export const Decrease: Story = {
  args: { direction: "decrease", "aria-label": "Decrease servings" },
};

export const Disabled: Story = {
  args: { direction: "decrease", "aria-label": "Decrease servings", disabled: true },
};

// As used in ServingsControl — a − / value / + cluster.
export const Cluster: Story = {
  render: (args) => (
    <div className="flex items-center justify-center gap-1">
      <PortionStepperButton {...args} direction="decrease" aria-label="Decrease servings" />
      <span className="min-w-8 text-center font-semibold tabular-nums">4</span>
      <PortionStepperButton {...args} direction="increase" aria-label="Increase servings" />
    </div>
  ),
};
