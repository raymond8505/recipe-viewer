import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";
import AuthButton from "./AuthButton";

const meta: Meta<typeof AuthButton> = {
  component: AuthButton,
  title: "Components/AuthButton",
  parameters: {
    layout: "centered",
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof AuthButton>;

export const LoggedIn: Story = {
  args: { isLoggedIn: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /logout/i })).toBeInTheDocument();
  },
};

export const GuestUser: Story = {
  args: { isLoggedIn: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /login/i })).toBeInTheDocument();
  },
};

export const LoginModalOpen: Story = {
  args: { isLoggedIn: false },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /login/i }));
    await expect(canvas.getByRole("heading", { name: /login/i })).toBeInTheDocument();
    await expect(canvas.getByPlaceholderText(/password/i)).toBeInTheDocument();
  },
};
