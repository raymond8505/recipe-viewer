import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import WFDCard from "./WFDCard";
import { recipeFixtures } from "@/fixtures";

const meta: Meta<typeof WFDCard> = {
  component: WFDCard,
  title: "Components/WhatsForDinner/WFDCard",
  parameters: {
    nextjs: { appDirectory: true },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 280, background: "#111827", padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    recipe: recipeFixtures[0],
    onClick: fn(),
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<typeof WFDCard>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};
