import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import RecipeTitleInput from "./RecipeTitleInput";

const meta: Meta<typeof RecipeTitleInput> = {
  component: RecipeTitleInput,
  title: "Components/Recipes/RecipeTitleInput",
  parameters: { layout: "padded" },
  args: { onChange: fn() },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 640 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof RecipeTitleInput>;

export const Empty: Story = { args: { value: "" } };

export const WithTitle: Story = { args: { value: "Weeknight Chili" } };

export const Disabled: Story = {
  args: { value: "Weeknight Chili", disabled: true },
};
