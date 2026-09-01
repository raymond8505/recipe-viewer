import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "./input";
import { Label } from "./label";

const meta: Meta<typeof Input> = {
  component: Input,
  title: "Components/UI/Input",
  parameters: {
    layout: "fullscreen",
  },
  globals: { viewport: { value: "control" } },
  args: {
    placeholder: "Type here…",
  },
};

export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const WithValue: Story = { args: { defaultValue: "1 tsp cumin" } };

export const Disabled: Story = {
  args: { defaultValue: "1 tsp cumin", disabled: true },
};

// Error state is driven by aria-invalid — the primitive renders the destructive
// ring/border off it (used by the editor's "timer needs a label" flag).
export const Invalid: Story = {
  args: { defaultValue: "", "aria-invalid": true },
};

// Paired with a Label via htmlFor — the standard form-field composition.
export const WithLabel: Story = {
  render: (args) => (
    <div className="grid gap-1.5">
      <Label htmlFor="ingredient">Ingredient</Label>
      <Input id="ingredient" {...args} />
    </div>
  ),
};
