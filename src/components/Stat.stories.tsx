import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Stat from "./Stat";

const meta: Meta<typeof Stat> = {
  component: Stat,
  title: "Components/Recipes/Stat",
};

export default meta;

type Story = StoryObj<typeof Stat>;

/** A single labeled value cell as it appears in the Time/Yield band. */
export const Default: Story = {
  args: { label: "Prep time", value: "15 min" },
};

/** A non-scalable yield rendered as a static servings stat. */
export const Servings: Story = {
  args: { label: "Servings", value: "6 servings" },
};
