import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ServingsControl from "./ServingsControl";

const meta: Meta<typeof ServingsControl> = {
  component: ServingsControl,
  title: "Components/Recipes/ServingsControl",
  args: {
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ServingsControl>;

export const Default: Story = {
  args: { servings: 4 },
};

/** A custom unit label (the yield's `unitText`) replaces the default "Servings". */
export const WithUnitLabel: Story = {
  args: { servings: 4, unitLabel: "kebabs" },
};
