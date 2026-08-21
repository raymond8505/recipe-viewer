import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import ServingsInputCell from "./ServingsInputCell";

const meta: Meta<typeof ServingsInputCell> = {
  component: ServingsInputCell,
  title: "Components/Recipes/ServingsInputCell",
  args: {
    label: "Servings",
    onChange: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof ServingsInputCell>;

/** Edits the recipe's BASE servings — unlike ServingsControl's display scaling. */
export const Default: Story = {
  args: { value: "4" },
};

/** A QuantitativeValue yield's `unitText` replaces the generic "Servings" label. */
export const WithUnitLabel: Story = {
  args: { value: "4", label: "kebabs" },
};

/** Empty input — a recipe with no yield yet gaining one while editing. */
export const Empty: Story = {
  args: { value: "" },
};

/** Disabled while the edit is saving. */
export const Disabled: Story = {
  args: { value: "4", disabled: true },
};
