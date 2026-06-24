import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { DragHandleButton } from "./DragHandleButton";

const meta: Meta<typeof DragHandleButton> = {
  component: DragHandleButton,
  title: "Components/Buttons/DragHandleButton",
  parameters: { layout: "centered" },
  args: { "aria-label": "Reorder row", onClick: fn() },
};

export default meta;

type Story = StoryObj<typeof DragHandleButton>;

// Neutral handle (ingredient/instruction rows).
export const Default: Story = {
  args: {
    className: "min-h-[40px] items-center self-stretch text-muted-foreground hover:text-foreground hover:bg-muted",
  },
};

// Brand-tinted handle (group/section header).
export const SectionHandle: Story = {
  args: {
    "aria-label": "Reorder section Sauce",
    className: "min-h-[40px] items-center text-brand hover:bg-muted",
  },
};

export const Disabled: Story = {
  args: { disabled: true, className: "min-h-[40px] text-muted-foreground" },
};
