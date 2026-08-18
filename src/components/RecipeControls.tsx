"use client";

import { useState, type ChangeEvent, type MutableRefObject } from "react";
import type { OpState } from "@/hooks/useUndoableSchemaOp";
import type { EditState } from "@/hooks/useRecipeEditor";
import { ALLOWED_IMAGE_CONTENT_TYPES } from "@/lib/imageTypes";
import { Button } from "@/components/ui/button";
import ConfirmBar from "@/components/ConfirmBar";
import { PrimaryActionButton } from "@/components/buttons";

/**
 * The actions that spend real money/time on an external service and so are
 * gated behind an up-front confirm: each one fires a webhook, and a misclick is
 * unrecoverable spend. The confirm label repeats the trigger button's label so
 * the bar names the action rather than saying "OK".
 */
const CONFIRM_ACTIONS = {
  rescrape: {
    label: "Re-scrape",
    message:
      "Re-scrape this recipe? This re-fetches and re-parses the source page.",
  },
  regenImage: {
    label: "Regen Image",
    message:
      "Generate a new image? This replaces the current image and can take a while.",
  },
} as const;

type ConfirmAction = keyof typeof CONFIRM_ACTIONS;

export interface RecipeControlsProps {
  isEditing: boolean;
  editState: EditState;
  canSave: boolean;
  /** Edit-mode source URL + status fields. */
  draftUrl: string;
  draftStatus: string;
  onUrlChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  /** Review banners shown when an op pre-populated the editor for confirmation. */
  isRescrapeReview: boolean;
  isRegenImageReview: boolean;
  isUploadImageReview: boolean;
  rescrapeState: OpState;
  regenImageState: OpState;
  /** Fire-and-forget ingredient normalization (queues a background re-run). */
  normalizeState: OpState;
  /** Whether the Re-scrape button applies (mounted + not viewing the source URL). */
  canRescrape: boolean;
  /** Image-upload validation error flag. */
  uploadError: boolean;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  onEditStart: () => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onRescrape: () => void;
  onRegenImage: () => void;
  onNormalize: () => void;
  onUploadOpen: () => void;
  onFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Presentational "Manage" toolbar for a recipe (edit / re-scrape / regen image /
 * upload image, plus the edit-mode source URL + status + Save/Cancel). Pure UI:
 * RecipeDetail owns all the editor/op/upload hooks and the composite handlers
 * and passes state + callbacks in. The `isLoggedIn` gate stays in RecipeDetail.
 *
 * The actions in `CONFIRM_ACTIONS` are gated behind an up-front confirm that
 * swaps the whole button row for a `ConfirmBar`, so their `on*` props only fire
 * on a second, deliberate click. Both also have an after-the-fact escape hatch
 * (the `*Review` editor states below); this gate sits in front of it so the
 * spend never happens on a misclick at all.
 */
export default function RecipeControls({
  isEditing,
  editState,
  canSave,
  draftUrl,
  draftStatus,
  onUrlChange,
  onStatusChange,
  isRescrapeReview,
  isRegenImageReview,
  isUploadImageReview,
  rescrapeState,
  regenImageState,
  normalizeState,
  canRescrape,
  uploadError,
  fileInputRef,
  onEditStart,
  onEditSave,
  onEditCancel,
  onRescrape,
  onRegenImage,
  onNormalize,
  onUploadOpen,
  onFileSelected,
}: RecipeControlsProps) {
  // Which expensive action is awaiting confirmation. Pure view state — the
  // component stays presentational for *op* state (RecipeDetail still owns
  // every hook); this mirrors the local `confirming` flag in editor rows.
  const [pending, setPending] = useState<ConfirmAction | null>(null);

  const runPending = () => {
    const action = pending;
    setPending(null);
    if (action === "rescrape") onRescrape();
    else if (action === "regenImage") onRegenImage();
  };

  // Rendered in both view-mode branches rather than hoisted out of the ternary:
  // the confirm swap must never unmount the upload path's file input, but edit
  // mode should keep exactly the DOM it has always had.
  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ALLOWED_IMAGE_CONTENT_TYPES.join(",")}
      onChange={onFileSelected}
      className="hidden"
      aria-label="Choose image file to upload"
    />
  );

  return (
    <section aria-label="Recipe management" className="mb-8">
      <h2 className="font-sans text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
        Manage
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        {isEditing ? (
          <>
            {isRescrapeReview && (
              <p className="w-full text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2 mb-1">
                Reviewing re-scraped data. Edit if needed, then confirm or
                cancel.
              </p>
            )}
            {isRegenImageReview && (
              <p className="w-full text-sm text-purple-700 bg-purple-50 rounded-lg px-3 py-2 mb-1">
                New image generated. Edit if needed, then confirm or cancel.
              </p>
            )}
            {isUploadImageReview && (
              <p className="w-full text-sm text-purple-700 bg-purple-50 rounded-lg px-3 py-2 mb-1">
                Reviewing uploaded image. Edit if needed, then confirm or
                cancel.
              </p>
            )}
            <div className="w-full mb-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Source URL
              </label>
              <input
                type="url"
                value={draftUrl}
                onChange={(e) => onUrlChange(e.target.value)}
                disabled={editState === "saving"}
                placeholder="https://example.com/recipe"
                className="w-full rounded-none border-0 border-b border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-hidden focus:border-brand disabled:opacity-60"
              />
            </div>
            <select
              value={draftStatus}
              onChange={(e) => onStatusChange(e.target.value)}
              disabled={editState === "saving"}
              className="px-3 py-2 text-sm font-medium rounded-none border-0 border-b border-gray-200 text-gray-700 bg-card focus:outline-hidden focus:border-brand disabled:opacity-60"
              aria-label="Recipe status"
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
            <PrimaryActionButton
              onClick={onEditSave}
              disabled={editState === "saving" || !canSave}
            >
              {editState === "saving"
                ? "Saving…"
                : isRescrapeReview || isRegenImageReview || isUploadImageReview
                  ? "Confirm"
                  : "Save"}
            </PrimaryActionButton>
            <Button
              variant="outline"
              onClick={onEditCancel}
              disabled={editState === "saving"}
            >
              Cancel
            </Button>
            {editState === "error" && (
              <span className="text-sm text-red-600">
                Save failed. Try again.
              </span>
            )}
            {!canSave && (
              <span className="text-sm text-red-600">
                A step timer needs both a label and a time.
              </span>
            )}
          </>
        ) : pending ? (
          <>
            <div className="w-full">
              <ConfirmBar
                message={CONFIRM_ACTIONS[pending].message}
                confirmLabel={CONFIRM_ACTIONS[pending].label}
                onCancel={() => setPending(null)}
                onConfirm={runPending}
              />
            </div>
            {hiddenFileInput}
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onEditStart}>
              Edit
            </Button>
            {canRescrape && (
              <Button
                variant="outline"
                onClick={() => setPending("rescrape")}
                disabled={rescrapeState === "loading"}
              >
                {rescrapeState === "loading" ? "Re-scraping…" : "Re-scrape"}
              </Button>
            )}
            {rescrapeState === "success" && (
              <span className="text-sm text-green-600">Recipe updated.</span>
            )}
            {rescrapeState === "error" && (
              <span className="text-sm text-red-600">
                Re-scrape failed. Try again.
              </span>
            )}
            <Button
              variant="outline"
              onClick={() => setPending("regenImage")}
              disabled={regenImageState === "loading"}
            >
              {regenImageState === "loading" ? "Generating…" : "Regen Image"}
            </Button>
            {regenImageState === "error" && (
              <span className="text-sm text-red-600">
                Image generation failed. Try again.
              </span>
            )}
            <Button variant="outline" onClick={onUploadOpen}>
              Upload Image
            </Button>
            {hiddenFileInput}
            {uploadError && (
              <span className="text-sm text-red-600">
                File must be PNG, JPEG, or WebP and under 4MB.
              </span>
            )}
            <Button
              variant="outline"
              onClick={onNormalize}
              disabled={normalizeState === "loading"}
            >
              {normalizeState === "loading" ? "Normalizing…" : "Normalize"}
            </Button>
            {normalizeState === "success" && (
              <span className="text-sm text-green-600">
                Normalization queued.
              </span>
            )}
            {normalizeState === "error" && (
              <span className="text-sm text-red-600">
                Normalization failed. Try again.
              </span>
            )}
          </>
        )}
      </div>
    </section>
  );
}
