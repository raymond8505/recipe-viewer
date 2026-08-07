import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import { ingredientFixtures } from "@/fixtures";
import IngredientsTable from "./IngredientsTable";

// Note: the "New ingredient" toggle (CreatingIngredient) drives internal
// `showCreate` state, so the click genuinely reveals the create panel — a valid
// visual transition, not a callback assertion.

const meta: Meta<typeof IngredientsTable> = {
  component: IngredientsTable,
  title: "Components/Ingredients/IngredientsTable",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof IngredientsTable>;

/**
 * The catalog as the admin sees it: USDA-sourced rows (badge shows the
 * FoodData Central id) alongside manual entries. The main-row nutrition is
 * read-only and scaled to each row's serving (its first portion, or 100 g when
 * it has none); the per-100 g values are editable in a row's details.
 */
export const Populated: Story = {
  args: {
    initialIngredients: ingredientFixtures,
    initialCount: ingredientFixtures.length,
  },
};

/**
 * A fresh install before any recipe has been normalized — points at the two
 * ways the catalog fills up (manual add, or saving a recipe).
 */
export const Empty: Story = {
  args: { initialIngredients: [], initialCount: 0 },
};

/**
 * A dirty row: editing any cell keeps changes draft-local and reveals the
 * per-row Save. Demonstrates the save affordance without a network call.
 */
export const EditingARow: Story = {
  args: {
    initialIngredients: ingredientFixtures.slice(0, 2),
    initialCount: 2,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nameInput = canvas.getByLabelText("Name for cumin seed");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "whole cumin seed");
  },
};

/**
 * Expanding a row (chevron in Actions) reveals the detail drawer: a live
 * FDA-style label preview on the left (with a portion selector, so entered
 * amounts can be checked against the physical package label) and the full
 * editable nutrition set — the six columns hidden from the main table plus
 * density — with portions and USDA provenance on the right. `expanded` is
 * internal row state, so the click genuinely changes what's shown.
 */
export const ExpandedDetail: Story = {
  args: {
    initialIngredients: ingredientFixtures.slice(0, 2),
    initialCount: 2,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Details for cumin seed"));
  },
};

/**
 * The "New ingredient" toggle opens the create panel (IngredientCreateForm)
 * inline above the table — name, aliases, a portions list seeded with the
 * default 100 g portion, and nutrition entered against a chosen portion.
 */
export const CreatingIngredient: Story = {
  args: {
    initialIngredients: ingredientFixtures.slice(0, 2),
    initialCount: 2,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "New ingredient" }));
  },
};

/**
 * Long catalogs paginate 50 at a time; the pager only renders past one page.
 */
export const Paginated: Story = {
  args: {
    initialIngredients: ingredientFixtures,
    initialCount: 120,
  },
};
