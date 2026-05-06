import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import AddTimerModal from "./AddTimerModal";

const meta: Meta<typeof AddTimerModal> = {
  component: AddTimerModal,
  title: "Components/Cooking Mode/AddTimerModal",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      // Modal uses absolute inset-0 so it needs a sized relative parent
      <div style={{ position: "relative", width: 420, height: 640, border: "1px dashed #e5e7eb" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onAdd: fn(),
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof AddTimerModal>;

export const NewTimer: Story = {};

export const EditTimer: Story = {
  args: { initialLabel: "Sauce", initialSeconds: 900 },
};
