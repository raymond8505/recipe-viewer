import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { SetCustomSourceButton } from "./SetCustomSourceButton";

const meta: Meta<typeof SetCustomSourceButton> = {
  component: SetCustomSourceButton,
  title: "Components/Buttons/SetCustomSourceButton",
  parameters: { layout: "centered" },
  args: { onClick: fn() },
};

export default meta;

type Story = StoryObj<typeof SetCustomSourceButton>;

/** A scraped recipe: the shortcut is live. */
export const Available: Story = {
  args: { value: "seriouseats.com" },
};

/**
 * Already the user's own recipe. The button disables itself rather than
 * disappearing — the flat state IS the "this is already yours" indicator, so
 * the field group needs no separate badge.
 */
export const AlreadyCustom: Story = {
  args: { value: "custom" },
};

/** Mid-save: the whole editor is frozen, this along with it. */
export const Saving: Story = {
  args: { value: "seriouseats.com", disabled: true },
};
