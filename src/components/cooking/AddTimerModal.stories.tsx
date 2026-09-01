import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import AddTimerModal from "./AddTimerModal";

const meta: Meta<typeof AddTimerModal> = {
  component: AddTimerModal,
  title: "Components/Cooking Mode/AddTimerModal",
  // The modal is `absolute inset-0` with no positioned ancestor, so it resolves
  // against the canvas itself — which is exactly the full-bleed overlay it is in
  // the app. No wrapper needed; the canvas IS the sized parent.
  parameters: { layout: "fullscreen" },
  args: {
    onAdd: fn(),
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AddTimerModal>;

/**
 * Phone width, where the modal is a bottom sheet: below `sm` it drops the
 * centering and the rounded card and sits flush against the bottom edge, which
 * is how cooking mode actually shows it on a propped-up phone.
 */
export const NewTimer: Story = {
  globals: { viewport: { value: "sheet" } },
};

/**
 * The same modal past `sm`, where it becomes a centered, width-capped dialog.
 * Both halves of that split are worth a story — the layout differs far more
 * than the args do.
 */
export const EditTimer: Story = {
  args: { initialLabel: "Sauce", initialSeconds: 900 },
  globals: { viewport: { value: "page" } },
};
