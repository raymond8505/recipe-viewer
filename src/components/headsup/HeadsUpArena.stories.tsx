import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, fn } from "storybook/test";
import HeadsUpArena from "./HeadsUpArena";
import type { Matchup } from "@/types/headsup";
import { recipeFixtures } from "@/fixtures";

const recipeA = recipeFixtures[2]; // Thai Curry Chicken Meatballs
const recipeB = recipeFixtures[1]; // Black Bean & Mushroom Enchiladas

const matchup: Matchup = { id1: recipeA.id, id2: recipeB.id };
const pool = [recipeA, recipeB];

const meta: Meta<typeof HeadsUpArena> = {
  component: HeadsUpArena,
  title: "Components/HeadsUp/HeadsUpArena",
  parameters: {
    nextjs: { appDirectory: true },
  },
  decorators: [
    (Story) => (
      <div
        style={{
          height: "100vh",
          background: "#111827",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    matchup,
    roundNumber: 1,
    matchupIndex: 0,
    matchupCount: 3,
    pool,
    selectedId: null,
    isConfirming: false,
    onSelect: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof HeadsUpArena>;

// Neither card selected — initial state
export const Presenting: Story = {
  play: async ({ canvas }) => {
    const [leftCard] = canvas.getAllByRole("button");
    await userEvent.click(leftCard);
  },
};

// Left card selected and confirming — shows "Chosen!" overlay and "Next matchup…" message
export const Confirming: Story = {
  args: { selectedId: recipeA.id, isConfirming: true },
};

export const SingleMatchup: Story = {
  args: { matchupCount: 1 },
};
