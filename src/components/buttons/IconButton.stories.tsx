import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { IconButton } from "./IconButton";
import { CloseIcon, EditIcon, TrashIcon } from "@/components/icons";

const meta: Meta<typeof IconButton> = {
  component: IconButton,
  title: "Components/Buttons/IconButton",
  parameters: { layout: "centered" },
  args: { onClick: fn() },
};

export default meta;

type Story = StoryObj<typeof IconButton>;

export const Close: Story = {
  args: { "aria-label": "Close", children: <CloseIcon /> },
};

export const Edit: Story = {
  args: { "aria-label": "Edit", children: <EditIcon /> },
};

export const Delete: Story = {
  args: {
    "aria-label": "Delete",
    children: <TrashIcon />,
    className: "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
  },
};

export const Disabled: Story = {
  args: { "aria-label": "Edit", children: <EditIcon />, disabled: true },
};
