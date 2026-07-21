import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, fn, within } from "storybook/test";
import { ingredientFixtures } from "@/fixtures";
import type { IngredientKeywordMatch } from "@/types/ingredient";
import IngredientAutocomplete from "./IngredientAutocomplete";

// In-memory stand-in for the trigram search route (the component's DI seam).
async function fixtureSearch(q: string): Promise<IngredientKeywordMatch[]> {
  const query = q.toLowerCase();
  return ingredientFixtures
    .filter(
      (ing) =>
        ing.name.toLowerCase().includes(query) ||
        ing.aliases.some((a) => a.toLowerCase().includes(query)),
    )
    .map((ing) => ({
      id: ing.id,
      name: ing.name,
      aliases: ing.aliases,
      nutrition: ing.nutrition,
      density_g_per_ml: ing.density_g_per_ml,
      similarity: ing.name.toLowerCase().startsWith(query) ? 0.95 : 0.6,
    }));
}

const meta: Meta<typeof IngredientAutocomplete> = {
  component: IngredientAutocomplete,
  title: "Components/Ingredients/IngredientAutocomplete",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 260 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    ariaLabel: "Change match for 1 tsp cumin",
    onSelect: fn(),
    search: fixtureSearch,
  },
};

export default meta;
type Story = StoryObj<typeof IngredientAutocomplete>;

/** Closed trigger showing the current catalog match. */
export const Closed: Story = {
  args: {
    value: { id: ingredientFixtures[0].id, name: ingredientFixtures[0].name },
  },
};

/** A line with no association renders the muted "unmatched" trigger. */
export const Unmatched: Story = {
  args: { value: null },
};

/**
 * Open with results: typing reveals the dropdown with match names, the
 * alias that ranked an indirect hit, similarity percentages, and the
 * "Clear match" item (present because a value is set).
 */
export const OpenWithResults: Story = {
  args: {
    value: { id: ingredientFixtures[4].id, name: ingredientFixtures[4].name },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Change match for 1 tsp cumin"));
    const input = canvas.getByRole("combobox");
    await userEvent.clear(input);
    await userEvent.type(input, "onion");
  },
};
