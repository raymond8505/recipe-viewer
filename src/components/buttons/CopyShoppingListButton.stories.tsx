import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { CopyShoppingListButton } from "./CopyShoppingListButton";

const meta: Meta<typeof CopyShoppingListButton> = {
  component: CopyShoppingListButton,
  title: "Components/Buttons/CopyShoppingListButton",
  parameters: { layout: "centered" },
  args: { onClick: fn() },
};

export default meta;

type Story = StoryObj<typeof CopyShoppingListButton>;

// Items selected — copy affordance is visible and enabled.
export const WithItems: Story = {
  args: { count: 3, copied: false },
};

// Just after a successful copy — checkmark feedback.
export const Copied: Story = {
  args: { count: 3, copied: true },
};

// Nothing selected — disabled and `invisible` (held in the DOM so the
// heading layout never shifts).
export const Empty: Story = {
  args: { count: 0, copied: false },
};
