import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import DeleteConfirm from "./DeleteConfirm";

const meta: Meta<typeof DeleteConfirm> = {
  component: DeleteConfirm,
  title: "Components/Recipes/Editor/DeleteConfirm",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "column" } },
  args: { onCancel: fn(), onConfirm: fn() },
};

export default meta;
type Story = StoryObj<typeof DeleteConfirm>;

export const Ingredient: Story = {
  args: { message: "Delete this ingredient?" },
};

export const Group: Story = {
  args: { message: "Delete “Spice blend” and its 3 ingredients?" },
};
