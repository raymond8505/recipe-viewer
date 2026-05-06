import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, fn } from "storybook/test";
import AddTimerModal from "./AddTimerModal";

const meta: Meta<typeof AddTimerModal> = {
  component: AddTimerModal,
  title: "Components/Cooking/AddTimerModal",
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

export const NewTimer: Story = {
  play: async ({ canvas, args }) => {
    // Focus starts on close button; click the label input to move focus
    await userEvent.click(canvas.getByLabelText(/label/i));
    await userEvent.type(canvas.getByLabelText(/label/i), "Sauce");
    await userEvent.click(canvas.getByRole("button", { name: /start timer/i }));
    await expect(args.onAdd).toHaveBeenCalledWith("Sauce", 300);
  },
};

export const EditTimer: Story = {
  args: { initialLabel: "Sauce", initialSeconds: 900 },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("heading", { name: "Edit Timer" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /save/i }));
    await expect(args.onAdd).toHaveBeenCalledWith("Sauce", 900);
  },
};

export const CloseButton: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByLabelText("Close"));
    await expect(args.onClose).toHaveBeenCalled();
  },
};
