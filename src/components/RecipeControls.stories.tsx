import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import RecipeControls from "./RecipeControls";

const meta: Meta<typeof RecipeControls> = {
  component: RecipeControls,
  title: "Components/Recipes/RecipeControls",
  parameters: { layout: "padded" },
  args: {
    isEditing: false,
    editState: "idle",
    canSave: true,
    draftUrl: "https://example.com/recipe",
    draftStatus: "published",
    isRescrapeReview: false,
    isRegenImageReview: false,
    isUploadImageReview: false,
    rescrapeState: "idle",
    regenImageState: "idle",
    canRescrape: true,
    uploadError: false,
    fileInputRef: { current: null },
    onUrlChange: fn(),
    onStatusChange: fn(),
    onEditStart: fn(),
    onEditSave: fn(),
    onEditCancel: fn(),
    onRescrape: fn(),
    onRegenImage: fn(),
    onUploadOpen: fn(),
    onFileSelected: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof RecipeControls>;

/** Default (not editing): Edit / Re-scrape / Regen Image / Upload Image. */
export const ViewMode: Story = {};

/** Editing: source URL + status + Save/Cancel. */
export const Editing: Story = {
  args: { isEditing: true, editState: "editing" },
};

/** Save is blocked while a step timer is half-specified. */
export const ValidationBlocked: Story = {
  args: { isEditing: true, editState: "editing", canSave: false },
};

/** Reviewing re-scraped data before confirming. */
export const RescrapeReview: Story = {
  args: { isEditing: true, editState: "editing", isRescrapeReview: true },
};
