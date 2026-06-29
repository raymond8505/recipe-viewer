import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Label } from "./label";
import { Input } from "./input";

const meta: Meta<typeof Label> = {
  component: Label,
  title: "Components/UI/Label",
  parameters: {
    layout: "centered",
  },
  args: {
    children: "Recipe title",
  },
};

export default meta;

type Story = StoryObj<typeof Label>;

export const Default: Story = {};

// Wrapping a field — clicking the label focuses the input it contains.
export const WrappingField: Story = {
  render: (args) => (
    <Label {...args} className="flex-col items-stretch gap-1.5">
      Recipe title
      <Input placeholder="e.g. Weeknight Chili" />
    </Label>
  ),
};

// Associated by htmlFor — label and field as siblings.
export const AssociatedByHtmlFor: Story = {
  render: () => (
    <div className="grid gap-1.5">
      <Label htmlFor="title">Recipe title</Label>
      <Input id="title" placeholder="e.g. Weeknight Chili" />
    </div>
  ),
};
