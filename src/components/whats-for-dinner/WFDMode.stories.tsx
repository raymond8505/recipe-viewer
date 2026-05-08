import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import WFDMode from "./WFDMode";

const meta: Meta<typeof WFDMode> = {
  component: WFDMode,
  title: "Components/WhatsForDinner/WFDMode",
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof WFDMode>;

// Initial prompt screen — user hasn't searched yet
export const PromptScreen: Story = {};
