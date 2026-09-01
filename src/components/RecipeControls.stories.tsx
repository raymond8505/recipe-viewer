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
    draftSource: "example.com",
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
 * The user's own recipe (`source: "custom"`) whose source URL is this very page
 * — re-scraping would fetch the page already on screen. Re-scrape stays in the
 * row but goes flat, with a tooltip (and accessible name) saying why; a button
 * that vanished would just read as a bug. Every other control is unchanged.
 */
export const OwnRecipe: Story = {
  args: { canRescrape: false },
};

/**
 * Re-scrape awaiting confirmation. Both webhook-backed actions spend on an
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

/** The same gate on Regen Image, whose confirm names the image replacement. */
export const RegenImageConfirm: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Regen Image" }));
    await expect(
      canvas.getByText(/replaces the current image/i),
    ).toBeInTheDocument();
  },
};

/**
 * The same gate on Normalize. It needs it most of the three: re-scrape and
 * regen-image land in a review state a misclick can be walked back from, while
 * this queues a background run and returns with nothing to undo.
 */
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
