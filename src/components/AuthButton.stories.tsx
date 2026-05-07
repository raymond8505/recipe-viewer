import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent } from "storybook/test";
import AuthButton from "./AuthButton";

const meta: Meta<typeof AuthButton> = {
  component: AuthButton,
  title: "Components/Recipes/AuthButton",
  parameters: {
    layout: "centered",
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof AuthButton>;

export const LoggedIn: Story = {
  args: { isLoggedIn: true },
};

export const GuestUser: Story = {
  args: { isLoggedIn: false },
};

export const LoginModalOpen: Story = {
  args: { isLoggedIn: false },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /login/i }));
  },
};
