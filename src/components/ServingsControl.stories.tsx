import type { Meta, StoryObj } from "@storybook/react";
import ServingsControl from "./ServingsControl";

const meta: Meta<typeof ServingsControl> = {
  component: ServingsControl,
  title: "Components/ServingsControl",
  args: {
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ServingsControl>;

export const Default: Story = {
  args: { servings: 4 },
};

export const OnePerson: Story = {
  args: { servings: 1 },
};

export const LargeParty: Story = {
  args: { servings: 12 },
};
