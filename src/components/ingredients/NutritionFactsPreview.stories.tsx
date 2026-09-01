import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import { ingredientFixtures } from "@/fixtures";
import { toPortionDrafts } from "./portions";
import NutritionFactsPreview from "./NutritionFactsPreview";

// The portion selector drives *internal* state (which serving the label
// shows), so the TbspServing play() genuinely changes what renders — a valid
// visual transition per Story Discipline, not a callback assertion.

const cumin = ingredientFixtures[0];

function draftNutrition(row: typeof cumin): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row.nutrition ?? {}).map(([key, value]) => [
      key,
      String(value),
    ]),
  );
}

const meta: Meta<typeof NutritionFactsPreview> = {
  component: NutritionFactsPreview,
  title: "Components/Ingredients/NutritionFactsPreview",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NutritionFactsPreview>;

/**
 * As mounted in the drawer: the label opens on the 100 g baseline (the stored
 * basis), with cumin's USDA portions selectable above it.
 */
export const Default: Story = {
  args: {
    nutrition: draftNutrition(cumin),
    portions: toPortionDrafts(cumin.food_portions),
    idPrefix: cumin.name,
  },
};

/**
 * Picking a household portion rescales every line — 375 kcal per 100 g reads
 * 23 per tbsp (6 g), the number the user checks against the package label.
 */
export const TbspServing: Story = {
  args: {
    nutrition: draftNutrition(cumin),
    portions: toPortionDrafts(cumin.food_portions),
    idPrefix: cumin.name,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(
      canvas.getByLabelText(`Nutrition label portion for ${cumin.name}`),
      "p1",
    );
  },
};
