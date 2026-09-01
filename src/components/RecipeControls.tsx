"use client";

import { useState, type ChangeEvent, type MutableRefObject } from "react";
import type { OpState } from "@/hooks/useUndoableSchemaOp";
import type { EditState } from "@/hooks/useRecipeEditor";
import { CUSTOM_RECIPE_SOURCE, isBrowsableUrl } from "@/lib/format";
import { ALLOWED_IMAGE_CONTENT_TYPES } from "@/lib/imageTypes";
import { ExternalLinkIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import ConfirmBar from "@/components/ConfirmBar";
import { PrimaryActionButton } from "@/components/buttons";

/**
 * The actions that spend real money/time on an external service and so are
 * gated behind an up-front confirm: each one fires a webhook or queues a model
 * run, and a misclick is unrecoverable spend. The confirm label repeats the
 * trigger button's label so the bar names the action rather than saying "OK".
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
  normalize: {
    label: "Normalize",
    message:
      "Re-run ingredient normalization? This re-parses every ingredient line.",
  },
} as const;

type ConfirmAction = keyof typeof CONFIRM_ACTIONS;

export interface RecipeControlsProps {
  isEditing: boolean;
  editState: EditState;
  canSave: boolean;
  /** Edit-mode source URL + source + status fields. */
  draftUrl: string;
  draftSource: string;
  draftStatus: string;
  onUrlChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  /** Review banners shown when an op pre-populated the editor for confirmation. */
  isRescrapeReview: boolean;
  isRegenImageReview: boolean;
  isUploadImageReview: boolean;
  rescrapeState: OpState;
  regenImageState: OpState;
  /** Fire-and-forget ingredient normalization (queues a background re-run). */
  normalizeState: OpState;
  /** Whether the Re-scrape button applies — false for the user's own recipes,
   *  which have no upstream page to re-fetch. */
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
 * on a second, deliberate click. Rescrape and regen-image also have an
 * after-the-fact escape hatch (the `*Review` editor states below), and this
 * gate sits in front of it so the spend never happens on a misclick at all.
 * Normalize has no such hatch — it queues a background run and returns — which
 * is exactly why the up-front confirm is the only guard it can have.
 */
export default function RecipeControls({
  isEditing,
  editState,
  canSave,
  draftUrl,
  draftSource,
  draftStatus,
  onUrlChange,
  onSourceChange,
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

  // Gates the open-in-new-tab link: false while a URL is half-typed, and the
  // guard that keeps a javascript: value out of a user-controlled href.
  const canOpenUrl = isBrowsableUrl(draftUrl);

  const runPending = () => {
    const action = pending;
    setPending(null);
    if (action === "rescrape") onRescrape();
    else if (action === "regenImage") onRegenImage();
    else if (action === "normalize") onNormalize();
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
            {/* The two provenance fields are one idea, so they share a group
                rather than stacking as unrelated rows. The legend carries the
                "Source" noun, which lets each label shrink to the part that
                differs. Both are full-width until sm — 50/50 on a phone leaves
                neither field usable. */}
            <fieldset className="w-full m-0 p-0 border-0 mb-1">
              <legend className="block text-xs font-medium text-gray-500 mb-2 p-0">
                Source
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 items-start">
                <div>
                  <label
                    htmlFor="recipe-source-url"
                    className="block text-xs font-medium text-gray-500 mb-1"
                  >
                    URL
                  </label>
                  {/* The underline moves to the wrapper so it spans the input
                      and the open-link button as one field. */}
                  <div className="flex items-center border-b border-gray-200 focus-within:border-brand">
                    <input
                      id="recipe-source-url"
                      type="url"
                      value={draftUrl}
                      onChange={(e) => onUrlChange(e.target.value)}
                      disabled={editState === "saving"}
                      placeholder="https://example.com/recipe"
                      className="flex-1 min-w-0 rounded-none border-0 px-3 py-2 text-sm text-gray-700 focus:outline-hidden disabled:opacity-60"
                    />
                    {/* `invisible` rather than unmounted, so the input keeps its
                        width while a URL is being typed. An <a> with no href is
                        already inert — not focusable, not exposed as a link —
                        so a half-typed value leaves no phantom tab stop. */}
                    <a
                      href={canOpenUrl ? draftUrl : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open source URL in a new tab"
                      aria-hidden={!canOpenUrl}
                      className={`shrink-0 p-2 text-gray-400 transition-colors hover:text-brand ${
                        canOpenUrl ? "" : "invisible"
                      }`}
                    >
                      <ExternalLinkIcon />
                    </a>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="recipe-source"
                    className="block text-xs font-medium text-gray-500 mb-1"
                  >
                    Name
                  </label>
                  <input
                    id="recipe-source"
                    type="text"
                    value={draftSource}
                    onChange={(e) => onSourceChange(e.target.value)}
                    disabled={editState === "saving"}
                    placeholder="seriouseats.com"
                    list="recipe-source-options"
                    className="w-full rounded-none border-0 border-b border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-hidden focus:border-brand disabled:opacity-60"
                  />
                  <datalist id="recipe-source-options">
                    <option value={CUSTOM_RECIPE_SOURCE} />
                  </datalist>
                </div>
              </div>
              {/* Spans the group rather than sitting under Name: hanging it off
                  one column would make the two halves different heights and
                  break the 50/50 read. Name is not just a label — isOwnRecipe
                  reads it, so the one value with behaviour attached is spelled
                  out rather than left for the user to infer. */}
              <p className="mt-1 text-xs text-gray-400">
                Where the recipe came from. Use &ldquo;{CUSTOM_RECIPE_SOURCE}
                &rdquo; as the name for your own recipes — those hide the
                Re-scrape button.
              </p>
            </fieldset>
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
              onClick={() => setPending("normalize")}
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
