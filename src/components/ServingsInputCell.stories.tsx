import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import ServingsInputCell from "./ServingsInputCell";

const meta: Meta<typeof ServingsInputCell> = {
  component: ServingsInputCell,
  title: "Components/Recipes/ServingsInputCell",
  args: {
    onChange: fn(),
    onUnitChange: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof ServingsInputCell>;

/** Edits the recipe's BASE servings — both columns — unlike ServingsControl's display scaling. */
export const Default: Story = {
  args: { value: "4", unit: "servings" },
};

/** A recipe that counts something of its own. The heading stays the static word. */
export const CustomUnit: Story = {
  args: { value: "12", unit: "kebabs" },
};

/**
 * No unit stored: the field shows the fallback word as a placeholder, which is
 * what a blank saves as and what the recipe will render.
 */
export const NoUnit: Story = {
  args: { value: "4", unit: "" },
};

/** Both empty — a recipe with no serving count yet gaining one while editing. */
export const Empty: Story = {
  args: { value: "", unit: "" },
};

/** Disabled while the edit is saving. */
export const Disabled: Story = {
  args: { value: "4", unit: "kebabs", disabled: true },
};
