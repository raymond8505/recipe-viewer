"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import type {
  RecipeRow,
  HowToStep,
  HowToSection,
  SchemaRecipe,
} from "@/types/recipe";
import {
  formatDuration,
  formatDate,
  getFirstImage,
  toArray,
  getIngredientText,
  toSchemaOrgJsonLd,
} from "@/lib/format";
import { useScalableRecipe } from "@/hooks/useScalableRecipe";
import { useRecipeEditor } from "@/hooks/useRecipeEditor";
import { useUndoableSchemaOp } from "@/hooks/useUndoableSchemaOp";
import { useImageUpload } from "@/hooks/useImageUpload";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  DEFAULT_MAX_IMAGE_BYTES,
} from "@/lib/imageTypes";
import CookingModeButton from "./CookingModeButton";
import { CheckIcon, CopyIcon } from "@/components/icons";
import IngredientsEditor from "./editor/IngredientsEditor";
import InstructionsEditor from "./editor/InstructionsEditor";
import IngredientItem from "./IngredientItem";
import ServingsControl from "./ServingsControl";
import NutritionPanel from "./NutritionPanel";

interface RecipeDetailProps {
  recipe: RecipeRow;
  isLoggedIn?: boolean;
  // Upload size cap, passed down from the server page (env.MAX_IMAGE_BYTES).
  // Client components can't import @/env — t3-env throws on server-var
  // access in the browser — so the prop is the only wiring.
  maxImageBytes?: number;
}

export default function RecipeDetail({
  recipe,
  isLoggedIn = false,
  maxImageBytes = DEFAULT_MAX_IMAGE_BYTES,
}: RecipeDetailProps) {
  const [schema, setSchema] = useState(recipe.metadata.schema);
  const [status, setStatus] = useState(recipe.status ?? "draft");
  const image = getFirstImage(schema.image);
  const prepTime = formatDuration(schema.prepTime);
  const cookTime = formatDuration(schema.cookTime);
  const totalTime = formatDuration(schema.totalTime);
  const categories = toArray(schema.recipeCategory);
  const {
    recipe: scalable,
    scalePortionsTo,
    splitPortions,
    anchorIngredientAmount,
  } = useScalableRecipe(schema);

  // Edit buffer + the two undoable schema operations (re-scrape / regen image)
  // + image-upload staging each own their slice of state in a dedicated hook;
  // this component only orchestrates the cross-cutting save/cancel flows.
  const editor = useRecipeEditor();
  const { editState, draft, patch } = editor;
  const imageUpload = useImageUpload(maxImageBytes);
  const rescrape = useUndoableSchemaOp(
    useCallback(async () => {
      const res = await fetch(`/api/recipes/${recipe.id}/rescrape`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      const { schema: updated } = await res.json();
      if (!updated) throw new Error();
      return updated as SchemaRecipe;
    }, [recipe.id]),
  );
  const regenImage = useUndoableSchemaOp(
    useCallback(
      async (current: SchemaRecipe) => {
        const res = await fetch(`/api/recipes/${recipe.id}/regenerate-image`, {
          method: "POST",
        });
        if (!res.ok) throw new Error();
        const result = await res.json();
        if (!result.image || typeof result.image !== "string")
          throw new Error();
        return { ...current, image: result.image };
      },
      [recipe.id],
    ),
  );

  // Shopping list
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(
    new Set(),
  );
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  // Read-only aliases consumed by the JSX below.
  const isEditing = editor.isEditing;
  const isRescrapeReview = rescrape.isReview;
  const isRegenImageReview = regenImage.isReview;
  const isUploadImageReview = imageUpload.isStaged;
  const rescrapeState = rescrape.state;
  const regenImageState = regenImage.state;
  const previewUrl = imageUpload.previewUrl;
  const fileInputRef = imageUpload.fileInputRef;

  // Adopt an op's resulting schema and open the editor on it for review.
  const beginReview = (next: SchemaRecipe) => {
    setSchema(next);
    editor.begin(next, status, recipe.url ?? "");
  };

  const handleRescrape = () => rescrape.run(schema, beginReview);

  const handleRegenImage = () =>
    regenImage.run(schema, (next) => {
      rescrape.clear();
      beginReview(next);
    });

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) =>
    imageUpload.onFileChange(e, () => {
      rescrape.clear();
      regenImage.clear();
      editor.begin(schema, status, recipe.url ?? "");
    });

  const handleEditStart = () => editor.begin(schema, status, recipe.url ?? "");

  const handleEditCancel = () => {
    if (rescrape.isReview) rescrape.undo(setSchema);
    else if (regenImage.isReview) regenImage.undo(setSchema);
    imageUpload.clear();
    editor.cancel();
  };

  const handleEditSave = () =>
    editor.runSave(async () => {
      const updatedSchema = editor.buildSchema(schema);
      if (imageUpload.isStaged) {
        updatedSchema.image = await imageUpload.upload(recipe.id);
      }
      const res = await fetch(`/api/recipes/${recipe.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: updatedSchema,
          status: draft.status,
          url: draft.url,
        }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (!result.schema) throw new Error();
      setSchema(result.schema);
      setStatus(result.status);
      rescrape.clear();
      regenImage.clear();
      imageUpload.clear();
    });

  const toggleIngredient = (text: string) => {
    setSelectedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(text)) next.delete(text);
      else next.add(text);
      return next;
    });
  };

  const copyShoppingList = async () => {
    const lines = (schema.recipeIngredient ?? [])
      .map(getIngredientText)
      .filter((text) => selectedIngredients.has(text));
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      /* silent fail */
    }
  };

  return (
    <article className="max-w-3xl lg:max-w-5xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map((cat) => (
            <span
              key={cat}
              className="px-3 py-1 bg-orange-50 text-orange-600 text-sm font-medium rounded-full"
            >
              {cat}
            </span>
          ))}
          {schema.recipeCuisine && (
            <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm font-medium rounded-full">
              {schema.recipeCuisine}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 mb-4">
          {isEditing ? (
            <input
              type="text"
              aria-label="Recipe title"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              disabled={editState === "saving"}
              placeholder="Recipe title"
              className="w-full rounded-lg border border-gray-200 p-3 text-3xl sm:text-4xl font-bold text-gray-900 leading-tight focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
            />
          ) : (
            <>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
                {schema.name}
              </h1>
              <CookingModeButton recipe={recipe} isLoggedIn={isLoggedIn} />
            </>
          )}
        </div>

        {isEditing ? (
          <textarea
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            disabled={editState === "saving"}
            placeholder="Description"
            className="w-full rounded-lg border border-gray-200 p-3 text-gray-700 text-lg leading-relaxed min-h-[80px] focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60 resize-y"
          />
        ) : (
          schema.description && (
            <p className="text-gray-600 text-lg leading-relaxed">
              {schema.description}
            </p>
          )
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-sm text-gray-500">
          {schema.datePublished && (
            <span>{formatDate(schema.datePublished)}</span>
          )}
        </div>
      </header>

      {/* Recipe Controls — logged-in only */}
      {isLoggedIn && (
        <section
          aria-label="Recipe management"
          className="mt-12 pt-6 border-t border-gray-100"
        >
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
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
                    value={draft.url}
                    onChange={(e) => patch({ url: e.target.value })}
                    disabled={editState === "saving"}
                    placeholder="https://example.com/recipe"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
                  />
                </div>
                <select
                  value={draft.status}
                  onChange={(e) => patch({ status: e.target.value })}
                  disabled={editState === "saving"}
                  className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
                  aria-label="Recipe status"
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
                <button
                  onClick={handleEditSave}
                  disabled={editState === "saving" || !editor.canSave}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {editState === "saving"
                    ? "Saving\u2026"
                    : isRescrapeReview || isRegenImageReview || isUploadImageReview
                      ? "Confirm"
                      : "Save"}
                </button>
                <button
                  onClick={handleEditCancel}
                  disabled={editState === "saving"}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                {editState === "error" && (
                  <span className="text-sm text-red-600">
                    Save failed. Try again.
                  </span>
                )}
                {!editor.canSave && (
                  <span className="text-sm text-red-600">
                    A step timer needs both a label and a time.
                  </span>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={handleEditStart}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Edit
                </button>
                {isMounted && recipe.url !== window.location.href && (
                  <button
                    onClick={handleRescrape}
                    disabled={rescrapeState === "loading"}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {rescrapeState === "loading"
                      ? "Re-scraping\u2026"
                      : "Re-scrape"}
                  </button>
                )}
                {rescrapeState === "success" && (
                  <span className="text-sm text-green-600">
                    Recipe updated.
                  </span>
                )}
                {rescrapeState === "error" && (
                  <span className="text-sm text-red-600">
                    Re-scrape failed. Try again.
                  </span>
                )}
                <button
                  onClick={handleRegenImage}
                  disabled={regenImageState === "loading"}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {regenImageState === "loading"
                    ? "Generating\u2026"
                    : "Regen Image"}
                </button>
                {regenImageState === "error" && (
                  <span className="text-sm text-red-600">
                    Image generation failed. Try again.
                  </span>
                )}
                <button
                  onClick={imageUpload.open}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Upload Image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_IMAGE_CONTENT_TYPES.join(",")}
                  onChange={handleFileSelected}
                  className="hidden"
                  aria-label="Choose image file to upload"
                />
                {imageUpload.error && (
                  <span className="text-sm text-red-600">
                    File must be PNG, JPEG, or WebP and under 4MB.
                  </span>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* Image */}
      {(previewUrl || image) && (
        <div className="w-full rounded-2xl overflow-hidden mb-8 bg-gray-100">
          <Image
            src={previewUrl ?? (image as string)}
            alt={schema.name}
            width={0}
            height={0}
            sizes="(max-width: 768px) 100vw, 768px"
            className="w-full h-auto"
            priority
            unoptimized={previewUrl !== null}
          />
        </div>
      )}

      {/* Time / Yield stats */}
      {(prepTime || cookTime || totalTime || schema.recipeYield) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 p-4 bg-orange-50 rounded-2xl">
          {prepTime && <Stat label="Prep time" value={prepTime} />}
          {cookTime && <Stat label="Cook time" value={cookTime} />}
          {totalTime && <Stat label="Total time" value={totalTime} />}
          {schema.recipeYield &&
            (scalable.currentServings != null ? (
              <ServingsControl
                servings={scalable.currentServings}
                onChange={scalePortionsTo}
              />
            ) : (
              <Stat
                label="Servings"
                value={
                  Array.isArray(schema.recipeYield)
                    ? schema.recipeYield[0]
                    : schema.recipeYield
                }
              />
            ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
        {/* Ingredients */}
        {(isEditing ||
          (schema.recipeIngredient && schema.recipeIngredient.length > 0)) && (
          <div className="sm:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Ingredients
              </h2>
              {!isEditing && (
                <button
                  onClick={copyShoppingList}
                  disabled={selectedIngredients.size === 0}
                  className={`p-2 rounded-lg transition-colors ${selectedIngredients.size === 0 ? "invisible" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
                  aria-label={`Copy shopping list, ${selectedIngredients.size} item${selectedIngredients.size === 1 ? "" : "s"}`}
                >
                  {copyFeedback ? <CheckIcon /> : <CopyIcon />}
                </button>
              )}
            </div>
            {isEditing ? (
              <IngredientsEditor
                value={draft.ingredients}
                onChange={(groups) => patch({ ingredients: groups })}
                disabled={editState === "saving"}
              />
            ) : (
              scalable.groupedIngredients.map(({ heading, items }, gi) => (
                <div key={gi} className={gi > 0 ? "mt-4" : ""}>
                  {heading && (
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-2">
                      {heading}
                    </h3>
                  )}
                  <ul className="space-y-2">
                    {items.map((ing, i) => {
                      const text = ing.original;
                      const selected = selectedIngredients.has(text);
                      return (
                        <li
                          key={i}
                          className={`flex items-start gap-2 text-sm rounded-lg px-2 py-1 -mx-2 cursor-pointer select-none transition-colors active:opacity-60 ${selected ? "bg-green-50 text-gray-700" : "text-gray-700"}`}
                          onClick={() => toggleIngredient(text)}
                          role="checkbox"
                          aria-checked={selected}
                          aria-label={text}
                        >
                          <span
                            className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${selected ? "bg-green-500" : "bg-orange-400"}`}
                          />
                          <IngredientItem
                            ingredient={ing}
                            onAnchor={(amount) =>
                              anchorIngredientAmount(ing.index, amount)
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        )}

        {/* Instructions */}
        {(isEditing ||
          (schema.recipeInstructions &&
            schema.recipeInstructions.length > 0)) && (
          <div className="sm:col-span-2">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Instructions
            </h2>
            {isEditing ? (
              <InstructionsEditor
                value={draft.instructions}
                onChange={(groups) => patch({ instructions: groups })}
                erroredStepIds={editor.instructionErrors}
                disabled={editState === "saving"}
              />
            ) : schema.recipeInstructions![0]["@type"] === "HowToSection" ? (
              <div className="space-y-6">
                {(schema.recipeInstructions as HowToSection[]).map(
                  (section, i) => (
                    <div key={i}>
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
                        {section.name}
                      </h3>
                      <ol className="space-y-3">
                        {section.itemListElement.map((step, j) => (
                          <li key={j} className="flex gap-4">
                            <span className="shrink-0 w-7 h-7 rounded-full bg-orange-500 text-white text-sm font-bold flex items-center justify-center">
                              {j + 1}
                            </span>
                            <p className="text-gray-700 leading-relaxed pt-0.5">
                              {step.text}
                            </p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <ol className="space-y-4">
                {(schema.recipeInstructions as HowToStep[]).map((step, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="shrink-0 w-7 h-7 rounded-full bg-orange-500 text-white text-sm font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <p className="text-gray-700 leading-relaxed pt-0.5">
                      {step.text}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      {(isEditing || schema.notes) && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Notes</h2>
          {isEditing ? (
            <textarea
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              disabled={editState === "saving"}
              placeholder="Add notes…"
              className="w-full rounded-lg border border-gray-200 p-3 text-gray-700 leading-relaxed min-h-[120px] focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60 resize-y"
            />
          ) : (
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">
              {schema.notes}
            </p>
          )}
        </div>
      )}

      {/* Nutrition */}
      <NutritionPanel recipe={scalable} onSplitPortions={splitPortions} />

      {/* JSON-LD — Schema.org-compliant only; escape </script> sequences to prevent tag injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(toSchemaOrgJsonLd(schema), null, 2).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function NutritionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 text-center">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="font-medium text-gray-900">{value}</p>
    </div>
  );
}
