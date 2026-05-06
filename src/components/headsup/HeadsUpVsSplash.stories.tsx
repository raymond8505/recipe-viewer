import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, fn } from "storybook/test";
import HeadsUpVsSplash from "./HeadsUpVsSplash";

const meta: Meta<typeof HeadsUpVsSplash> = {
  component: HeadsUpVsSplash,
  title: "Components/HeadsUp/HeadsUpVsSplash",
  args: { onComplete: fn() },
};

export default meta;
type Story = StoryObj<typeof HeadsUpVsSplash>;

// Component auto-calls onComplete after 1500ms via useEffect
export const Round1: Story = {
  args: { roundNumber: 1 },
  play: async ({ args }) => {
    await waitFor(
      () => expect(args.onComplete).toHaveBeenCalled(),
      { timeout: 2500 },
    );
  },
};

export const LaterRound: Story = {
  args: { roundNumber: 5 },
  play: async ({ args }) => {
    await waitFor(
      () => expect(args.onComplete).toHaveBeenCalled(),
      { timeout: 2500 },
    );
  },
};
