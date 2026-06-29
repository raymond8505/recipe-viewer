import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Textarea } from "./textarea";
import { Label } from "./label";

const meta: Meta<typeof Textarea> = {
  component: Textarea,
  title: "Components/UI/Textarea",
  parameters: {
    layout: "centered",
  },
  args: {
    placeholder: "Describe this step…",
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Textarea>;

export const Default: Story = {};

export const WithValue: Story = {
  args: { defaultValue: "Simmer over low heat until the sauce thickens." },
};

export const Disabled: Story = {
  args: { defaultValue: "Simmer over low heat.", disabled: true },
};

export const Invalid: Story = { args: { "aria-invalid": true } };

export const WithLabel: Story = {
  render: (args) => (
    <div className="grid gap-1.5">
      <Label htmlFor="notes">Notes</Label>
      <Textarea id="notes" {...args} />
    </div>
  ),
};
