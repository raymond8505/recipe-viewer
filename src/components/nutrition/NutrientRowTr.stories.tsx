import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import NutrientRowTr from "./NutrientRowTr";

// Purely prop-driven, so every story is args-only.
//
// The component renders a bare <tr>, so the decorator supplies the <table> and
// <tbody> it needs to lay out at all. The wrapper also carries `@container`,
// because the tabular abbreviation swap is a container query — without an
// `@container` ancestor the `@lg:` half never matches. Its width is what
// decides which wording the Abbreviated story shows.

const meta: Meta<typeof NutrientRowTr> = {
  component: NutrientRowTr,
  title: "Components/Nutrition/NutrientRowTr",
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="@container w-80 rounded-sm border border-border bg-card p-4">
        <table className="w-full">
          <tbody>
            <Story />
          </tbody>
        </table>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NutrientRowTr>;

/** A top-level nutrient: name in the site's semibold, amount right-aligned. */
export const Default: Story = {
  args: {
    row: { key: "fat", name: "Total Fat", value: { value: 18, unit: "g" } },
    tabular: false,
  },
};

/**
 * A sub-nutrient. The linear/tabular formats have no indent column, so weight
 * plus a small inset carries the hierarchy: subs drop to the ambient body
 * weight while their parent stays semibold.
 */
export const SubNutrient: Story = {
  args: {
    row: {
      key: "saturatedFat",
      name: "Saturated Fat",
      short: "Sat. Fat",
      value: { value: 5, unit: "g" },
      sub: true,
    },
    tabular: false,
  },
};

/**
 * In the tabular layout the row carries both wordings and the container query
 * picks one. The decorator here is 20rem — under the 32rem switch — so this
 * shows the full name; widen the viewport story below to see "Total Carb.".
 */
export const TabularNarrow: Story = {
  args: {
    row: {
      key: "carbohydrate",
      name: "Total Carbohydrate",
      short: "Total Carb.",
      value: { value: 48, unit: "g" },
    },
    tabular: true,
  },
};

/**
 * The same row past the 32rem container switch, where the narrow columns take
 * the FDA abbreviation instead.
 */
export const TabularWide: Story = {
  args: TabularNarrow.args,
  decorators: [
    (Story) => (
      <div className="@container w-[36rem] rounded-sm border border-border bg-card p-4">
        <table className="w-full">
          <tbody>
            <Story />
          </tbody>
        </table>
      </div>
    ),
  ],
};

/** A milligram nutrient, showing the shared right-aligned tabular figures. */
export const Milligrams: Story = {
  args: {
    row: { key: "sodium", name: "Sodium", value: { value: 820, unit: "mg" } },
    tabular: false,
  },
};
