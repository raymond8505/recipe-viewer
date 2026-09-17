import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RecipeMatchBadge } from "./RecipeMatchBadge";

/**
 * The pill that explains why a recipe is in a set of search results when its
 * title doesn't contain the query — recipe search matches catalog ingredients
 * as well as names, so "Weeknight Tacos" can be the right answer to
 * "cilantro". Without the badge that card reads as a broken result.
 *
 * It rides in the card's top badge slot, leftmost of the category and the
 * status. Green marks it as a search hit rather than a surface, which is why
 * it is an explicit color class rather than a theme token — the same grounds
 * `RecipeStatusBadge` states for its per-status colors. Note that `published`
 * wears the same green, so the two read as a pair on a published card.
 *
 * It names the ingredient by its CATALOG name even when an alias is what
 * matched, because the catalog name is the spelling that also identifies the
 * row in the ingredient manager.
 */
const meta: Meta<typeof RecipeMatchBadge> = {
  component: RecipeMatchBadge,
  title: "Components/Recipes/RecipeMatchBadge",
};

export default meta;
type Story = StoryObj<typeof RecipeMatchBadge>;

/** A short, recipe-language catalog name — the comfortable case. */
export const ShortName: Story = {
  args: { name: "black pepper" },
};

/**
 * USDA wording is how most catalog rows are named, and it is long. This is the
 * width a card footer actually has to absorb, so it is the case to design
 * against rather than the tidy one above.
 */
export const UsdaName: Story = {
  args: { name: "Butter, without salt" },
};

/** The longest names in the catalog carry a parenthetical as well. */
export const LongUsdaName: Story = {
  args: { name: "Coriander (cilantro) leaves, raw" },
};
