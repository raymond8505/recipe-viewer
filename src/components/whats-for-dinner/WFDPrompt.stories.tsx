import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import WFDPrompt from "./WFDPrompt";

const meta: Meta<typeof WFDPrompt> = {
  component: WFDPrompt,
  title: "Components/WhatsForDinner/WFDPrompt",
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
  },
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
type Story = StoryObj<typeof WFDPrompt>;

export const Idle: Story = {};

export const Loading: Story = {
  args: { isLoading: true },
};

export const WithError: Story = {
  args: { error: "Not enough recipes found — try a broader search." },
};
