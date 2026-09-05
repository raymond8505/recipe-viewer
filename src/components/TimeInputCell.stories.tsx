import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import TimeInputCell from "./TimeInputCell";

const meta: Meta<typeof TimeInputCell> = {
  component: TimeInputCell,
  title: "Components/Recipes/TimeInputCell",
  args: {
    label: "Prep time",
    onChange: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof TimeInputCell>;

/** Edits the recipe's persisted prep time. Minutes, not the m:ss a step timer takes. */
export const Default: Story = {
  args: { value: "20" },
};

/** Long bakes stay legible as plain minutes — 4 hours is "240", not "4:00:00". */
export const LongDuration: Story = {
  args: { label: "Total time", value: "240" },
};

/** Empty input: a recipe with no cook time yet, or one being cleared. The
 *  placeholder is the only thing naming the unit once the label is read. */
export const Empty: Story = {
  args: { label: "Cook time", value: "" },
};

/** Disabled while the edit is saving. */
export const Disabled: Story = {
  args: { value: "20", disabled: true },
};
