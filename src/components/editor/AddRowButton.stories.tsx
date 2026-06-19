import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import AddRowButton from "./AddRowButton";

const meta: Meta<typeof AddRowButton> = {
  component: AddRowButton,
  title: "Components/Recipes/Editor/AddRowButton",
  parameters: { layout: "padded" },
  args: { onClick: fn() },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AddRowButton>;

export const AddIngredient: Story = { args: { label: "Add ingredient" } };
export const AddGroup: Story = { args: { label: "Add group" } };
export const Disabled: Story = { args: { label: "Add step", disabled: true } };
