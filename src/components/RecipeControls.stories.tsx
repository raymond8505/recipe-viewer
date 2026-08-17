import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";
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
    normalizeState: "idle",
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
    onNormalize: fn(),
    onUploadOpen: fn(),
    onFileSelected: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof RecipeControls>;

/** Default (not editing): Edit / Re-scrape / Regen Image / Upload Image / Normalize. */
export const ViewMode: Story = {};

/**
 * Re-scrape awaiting confirmation. The three expensive actions each spend on an
 * external service, so the whole button row swaps for a confirm bar — one
 * decision on screen, nothing spent on a misclick. The bar is driven by the
 * component's own state, so the click is what makes it visible.
 */
export const RescrapeConfirm: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Re-scrape" }));
    await expect(
      canvas.getByText(/re-fetches and re-parses the source page/i),
    ).toBeInTheDocument();
  },
};

/** Same gate on Normalize, which queues a model run and has no undo at all. */
export const NormalizeConfirm: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Normalize" }));
    await expect(
      canvas.getByText(/re-parses every ingredient line/i),
    ).toBeInTheDocument();
  },
};

/** Normalization request in flight — the button reads "Normalizing…" and disables. */
export const Normalizing: Story = {
  args: { normalizeState: "loading" },
};

/** Normalization queued — transient success confirmation next to the button. */
export const NormalizeQueued: Story = {
  args: { normalizeState: "success" },
};

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
