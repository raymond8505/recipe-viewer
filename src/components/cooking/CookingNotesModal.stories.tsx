import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import CookingNotesModal from "./CookingNotesModal";

const meta: Meta<typeof CookingNotesModal> = {
  component: CookingNotesModal,
  title: "Components/Cooking Mode/CookingNotesModal",
  // `absolute inset-0` with no positioned ancestor resolves against the canvas,
  // which is the full-bleed overlay it is in cooking mode.
  parameters: { layout: "fullscreen" },
  args: {
    value: "Added extra garlic this time. Sauce needed 5 more minutes to reduce.",
    onChange: fn(),
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof CookingNotesModal>;

/**
 * Phone width: a bottom sheet flush with the screen edge, where a cook reaches
 * it from the timer ribbon. "Saved ✓" is what a settled autosave looks like.
 */
export const Sheet: Story = {
  args: { saveState: "saved" },
  globals: { viewport: { value: "sheet" } },
};

/**
 * Past `sm` the same modal is a centered, width-capped dialog — how it opens
 * from the desktop timer column. Shown mid-save.
 */
export const Dialog: Story = {
  args: { saveState: "saving" },
  globals: { viewport: { value: "page" } },
};

/**
 * A failed save stays visible beside the title; the text is kept, and the next
 * keystroke retries.
 */
export const SaveError: Story = {
  args: { saveState: "error" },
  globals: { viewport: { value: "sheet" } },
};
