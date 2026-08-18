import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import ConfirmBar from "./ConfirmBar";

const meta: Meta<typeof ConfirmBar> = {
  component: ConfirmBar,
  title: "Components/ConfirmBar",
  parameters: { layout: "padded" },
  args: { onCancel: fn(), onConfirm: fn() },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ConfirmBar>;

/** Default tone — an action that is expensive or slow, but reversible. */
export const Neutral: Story = {
  args: {
    message:
      "Re-scrape this recipe? This re-fetches and re-parses the source page.",
    confirmLabel: "Re-scrape",
  },
};

/** The red treatment, reserved for irreversible data loss. */
export const Destructive: Story = {
  args: {
    tone: "destructive",
    message: "Delete “Spice blend” and its 3 ingredients?",
    confirmLabel: "Delete",
  },
};

/** A long message wraps above the buttons; the two stay evenly split. */
export const LongMessage: Story = {
  args: {
    message:
      "Generate a new image? This replaces the current image and can take a while.",
    confirmLabel: "Regen Image",
  },
};
