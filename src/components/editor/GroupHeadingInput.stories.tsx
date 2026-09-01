import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import GroupHeadingInput from "./GroupHeadingInput";

const meta: Meta<typeof GroupHeadingInput> = {
  component: GroupHeadingInput,
  title: "Components/Recipes/Editor/GroupHeadingInput",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "panel" } },
  args: { onChange: fn() },
};

export default meta;

type Story = StoryObj<typeof GroupHeadingInput>;

export const Empty: Story = { args: { value: "" } };

export const Named: Story = { args: { value: "Spice blend" } };

export const Disabled: Story = { args: { value: "Spice blend", disabled: true } };
