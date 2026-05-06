import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, fn } from "storybook/test";
import HeadsUpArena from "./HeadsUpArena";
import type { RecipeRow } from "@/types/recipe";
import type { Matchup } from "@/types/headsup";

const makeRecipe = (id: string, name: string, image?: string): RecipeRow => ({
  id,
  url: `https://example.com/${id}`,
  source: "example.com",
  status: "published",
  metadata: {
    schema: {
      name,
      description: `A delicious ${name.toLowerCase()} recipe.`,
      image,
      totalTime: "PT30M",
      recipeYield: "4 servings",
      recipeCuisine: "International",
    },
  },
});

const recipeA = makeRecipe(
  "r1",
  "Pasta Carbonara",
  "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400",
);
const recipeB = makeRecipe("r2", "Chicken Tikka Masala");

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
  play: async ({ canvas, args }) => {
    const [leftCard] = canvas.getAllByRole("button");
    await userEvent.click(leftCard);
    await expect(args.onSelect).toHaveBeenCalledWith(recipeA.id);
  },
};

// Left card selected and confirming — shows "Chosen!" overlay and "Next matchup…" message
export const Confirming: Story = {
  args: { selectedId: recipeA.id, isConfirming: true },
};

export const SingleMatchup: Story = {
  args: { matchupCount: 1 },
};
