import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import WFDArena from "./WFDArena";
import { recipeFixtures } from "@/fixtures";

const meta: Meta<typeof WFDArena> = {
  component: WFDArena,
  title: "Components/WhatsForDinner/WFDArena",
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", background: "#111827", display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    contenders: [recipeFixtures[0], recipeFixtures[1]],
    losingIndices: [],
    phase: "presenting",
    onPick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof WFDArena>;

// Two contenders ready to pick from
export const Presenting: Story = {};

// After picking index 0 — index 1 is animating out, waiting for new contender
export const LoadingNextContender: Story = {
  args: { losingIndices: [1], phase: "loading" },
};
