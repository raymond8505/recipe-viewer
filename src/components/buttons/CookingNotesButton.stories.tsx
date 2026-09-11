import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { CookingNotesButton } from "./CookingNotesButton";

const meta: Meta<typeof CookingNotesButton> = {
  component: CookingNotesButton,
  title: "Components/Buttons/CookingNotesButton",
  parameters: { layout: "centered" },
  args: { onClick: fn() },
};

export default meta;

type Story = StoryObj<typeof CookingNotesButton>;

export const Default: Story = {
  args: { className: "px-3 py-3" },
};
