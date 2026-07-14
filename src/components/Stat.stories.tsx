import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import Stat from "./Stat";

const meta: Meta<typeof Stat> = {
  component: Stat,
  title: "Components/Recipes/Stat",
  parameters: { layout: "padded" },
  args: {
    label: "Prep time",
    value: "15 min",
  },
};

export default meta;
type Story = StoryObj<typeof Stat>;

/** A single stat cell: uppercase label over a bold value. */
export const Default: Story = {};

/** Compound values render verbatim — the value is a plain display string. */
export const CompoundValue: Story = {
  args: { label: "Total time", value: "1 hr 30 min" },
};

/** Controlled wrapper so the edit input is live (edit state lives in the
 *  parent, so a stateful wrapper — not a play() test — is the right demo). */
function EditingDemo() {
  const [value, setValue] = useState("15 min");
  return <Stat label="Prep time" value={value} editing onChange={setValue} />;
}

/** In edit mode the value becomes an underline text input. */
export const Editing: Story = {
  render: () => <EditingDemo />,
};
