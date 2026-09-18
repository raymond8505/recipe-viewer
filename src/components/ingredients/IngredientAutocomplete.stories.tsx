import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, fn, within } from "storybook/test";
import { ingredientFixtures, makeIngredient } from "@/fixtures";
import type { IngredientKeywordMatch } from "@/types/ingredient";
import type { UsdaSearchFood } from "@/lib/usda";
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

// USDA candidates for the fallback flow, shaped like the /api/usda/search
// proxy's response (Branded included — the human picks).
async function fixtureUsdaSearch(q: string): Promise<UsdaSearchFood[]> {
  return [
    { fdcId: 2710101, description: `${q.toUpperCase()}, TRADITIONAL`, dataType: "Branded" },
    { fdcId: 173460, description: `Sauce, ${q}, ready-to-serve`, dataType: "SR Legacy" },
  ];
}

const meta: Meta<typeof IngredientAutocomplete> = {
  component: IngredientAutocomplete,
  title: "Components/Ingredients/IngredientAutocomplete",
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "control" } },
  args: {
    ariaLabel: "Change match for 1 tsp cumin",
    onSelect: fn(),
    onImportUsda: fn(),
    search: fixtureSearch,
    usdaSearch: fixtureUsdaSearch,
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

// A USDA-shaped catalog name, long enough to wrap in the frozen column. The
// wrapping is the whole subject of the height-parity story below — the short
// fixture names never wrap, which is exactly why this bug survived a story
// that used one.
const wrappingMatch = makeIngredient(
  "ing-wrapping",
  "yellow onion, sautéed, drained",
);

/**
 * Open and closed occupy the same box, at the real column width — 176px, the
 * `w-44` the breakdown table freezes these cells to, which is why the canvas
 * is pinned to the exact number rather than a named surface.
 *
 * The editor replaces the trigger with a single-line input, and an input
 * can't wrap. With a name that takes two lines closed, opening it used to
 * collapse the cell to one and jump every row below it up the table. The
 * closed label now stays in the DOM invisibly to hold the height, so the
 * dividers here should not move when the second row opens.
 */
export const OpenAndClosedMatchHeights: Story = {
  args: { value: { id: wrappingMatch.id, name: wrappingMatch.name } },
  globals: { viewport: { value: "176px-400px" } },
  render: (args) => (
    <div className="divide-y divide-border border-y border-border">
      <IngredientAutocomplete {...args} ariaLabel="Change match for the closed row" />
      <IngredientAutocomplete {...args} ariaLabel="Change match for the open row" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Change match for the open row"));
  },
};

/**
 * Options open **upward** when the scrollport has no room below the trigger.
 * This is the shape the breakdown table puts them in: a scroll box with a
 * `sticky bottom-0` totals band, and the line near the bottom of it. Opening
 * downward here would put every option under the band, where the pointer can't
 * reach them — no z-index fixes that, because the box clips the panel too.
 *
 * The wrapper is the subject, not scaffolding: the placement is measured
 * against exactly these two things (see `@/lib/dropdownPlacement`).
 */
export const FlipsAboveAPinnedFooter: Story = {
  args: { value: null },
  decorators: [
    (Story) => (
      <div className="h-64 overflow-auto border border-border">
        <div className="h-40 bg-muted/30" />
        <div className="px-2">
          <Story />
        </div>
        <div className="sticky bottom-0 h-8 border-t border-border bg-muted px-2 text-xs leading-8">
          Recipe total
        </div>
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Change match for 1 tsp cumin"));
    await userEvent.type(canvas.getByRole("combobox"), "onion");
  },
};

/**
 * The USDA fallback for an ingredient the catalog doesn't know: the query
 * finds no catalog matches, so the "Search USDA" action runs the FoodData
 * Central search and lists candidates with their data-type provenance
 * (Branded included — the human picks).
 */
export const UsdaFallback: Story = {
  args: { value: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Change match for 1 tsp cumin"));
    await userEvent.type(canvas.getByRole("combobox"), "gochujang");
    const action = await canvas.findByRole("option", { name: /Search USDA for/ });
    await userEvent.click(action);
    await canvas.findByRole("option", { name: /GOCHUJANG, TRADITIONAL/ });
  },
};
