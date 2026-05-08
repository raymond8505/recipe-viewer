import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import WFDButton from "./WFDButton";

const meta: Meta<typeof WFDButton> = {
  component: WFDButton,
  title: "Components/WhatsForDinner/WFDButton",
  parameters: {
    layout: "centered",
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof WFDButton>;

export const Default: Story = {};
