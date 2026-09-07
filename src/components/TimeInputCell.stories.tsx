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

/** Edits the recipe's persisted prep time in HH:MM — the colon means hours,
 *  unlike the m:ss a step timer takes. */
export const Default: Story = {
  args: { value: "0:20" },
};

/** Long bakes read naturally in HH:MM — a 4-hour proof is "4:00". */
export const LongDuration: Story = {
  args: { label: "Total time", value: "4:00" },
};

/** Empty input: a recipe with no cook time yet, or one being cleared. The
 *  placeholder is what names the expected format. */
export const Empty: Story = {
  args: { label: "Cook time", value: "" },
};

/** Mid-typing, before blur: a bare minute count is accepted as typed and
 *  re-spelled to "0:45" once the field loses focus. */
export const UncanonicalEntry: Story = {
  args: { value: "45" },
};

/** Disabled while the edit is saving. */
export const Disabled: Story = {
  args: { value: "0:20", disabled: true },
};
