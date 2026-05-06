import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, fn } from "storybook/test";
import MealSearch from "./MealSearch";
import type { RecipeRow } from "@/types/recipe";

const makeRecipe = (id: string, name: string, source = "example.com"): RecipeRow => ({
  id,
  url: `https://example.com/${id}`,
  source,
  status: "published",
  metadata: { schema: { name } },
});

const searchResults: RecipeRow[] = [
  makeRecipe("r1", "Pasta Carbonara", "seriouseats.com"),
  makeRecipe("r2", "Chicken Tikka Masala", "nytcooking.com"),
];

const meta: Meta<typeof MealSearch> = {
  component: MealSearch,
  title: "Components/Cooking/MealSearch",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 380 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    excludeIds: new Set<string>(),
    onAdd: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof MealSearch>;

// Input at rest — no fetch called
export const Empty: Story = {};

// Fetch returns results after debounce (300ms)
export const WithResults: Story = {
  beforeEach: async () => {
    global.fetch = fn().mockResolvedValue({
      json: async () => ({ data: searchResults }),
    } as unknown as Response);
  },
  play: async ({ canvas, args }) => {
    await userEvent.type(canvas.getByRole("combobox"), "pasta");
    await waitFor(
      () => expect(canvas.getByText("Pasta Carbonara")).toBeInTheDocument(),
      { timeout: 1200 },
    );
    await userEvent.click(canvas.getByText("Pasta Carbonara"));
    await expect(args.onAdd).toHaveBeenCalledWith(searchResults[0]);
  },
};

// Fetch returns empty array — "No recipes found" message
export const NoResults: Story = {
  beforeEach: async () => {
    global.fetch = fn().mockResolvedValue({
      json: async () => ({ data: [] }),
    } as unknown as Response);
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("combobox"), "xyzzy");
    await waitFor(
      () => expect(canvas.getByText("No recipes found")).toBeInTheDocument(),
      { timeout: 1200 },
    );
  },
};
