import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, fn } from "storybook/test";
import HeadsUpPrompt from "./HeadsUpPrompt";

const meta: Meta<typeof HeadsUpPrompt> = {
  component: HeadsUpPrompt,
  title: "Components/HeadsUp/HeadsUpPrompt",
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", background: "#111827" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onSubmit: fn(),
    isLoading: false,
    error: null,
  },
};

export default meta;
type Story = StoryObj<typeof HeadsUpPrompt>;

export const Default: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.type(canvas.getByRole("textbox"), "something warm for dinner");
    await userEvent.click(canvas.getByRole("button", { name: /fight/i }));
    await expect(args.onSubmit).toHaveBeenCalledWith("something warm for dinner");
  },
};

export const Loading: Story = {
  args: { isLoading: true },
};

export const WithError: Story = {
  args: {
    error: "Could not find matching recipes. Please try a different prompt.",
  },
};
