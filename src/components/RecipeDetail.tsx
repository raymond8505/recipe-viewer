"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { DEFAULT_MAX_IMAGE_BYTES } from "@/lib/imageTypes";
import CookingModeButton from "./CookingModeButton";
import RecipeControls from "./RecipeControls";
import { CopyShoppingListButton } from "@/components/buttons";
import IngredientsEditor from "./editor/IngredientsEditor";
import InstructionsEditor from "./editor/InstructionsEditor";
import YieldEditor from "./editor/YieldEditor";
import IngredientItem from "./IngredientItem";
import TimeYieldStats from "./TimeYieldStats";
import NutritionPanel from "./NutritionPanel";
import RecipeTitleInput from "./RecipeTitleInput";
import { Textarea } from "@/components/ui/textarea";

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
  // Reset timer for the "Copied!" feedback — tracked so it can be cleared on
  // unmount (a stray fire would setState after teardown → "window is not defined").
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    },
    [],
  );
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
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
      copyResetTimer.current = setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      /* silent fail */
    }
  };

  return (
    <article>
      <div className="max-w-3xl lg:max-w-5xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map((cat) => (
              <span
                key={cat}
                className="px-3 py-1 bg-brand-subtle text-brand text-sm font-medium rounded-full"
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
              <RecipeTitleInput
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                disabled={editState === "saving"}
              />
            ) : (
              <>
                <h1 className="text-3xl sm:text-4xl text-gray-900 leading-tight">
                  {schema.name}
                </h1>
                <CookingModeButton recipe={recipe} isLoggedIn={isLoggedIn} />
              </>
            )}
          </div>

          {isEditing ? (
            <Textarea
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              disabled={editState === "saving"}
              placeholder="Description"
              className="p-3 text-lg leading-relaxed min-h-[80px] resize-y md:text-lg"
            />
          ) : (
            schema.description && (
              <p className="text-gray-600 text-lg leading-relaxed">
                {schema.description}
              </p>
            )
          )}

          {isEditing && (
            <div className="mt-6">
              <YieldEditor
                value={draft.yieldFields}
                onChange={(yieldFields) => patch({ yieldFields })}
                disabled={editState === "saving"}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-sm text-gray-500">
            {schema.datePublished && (
              <span>{formatDate(schema.datePublished)}</span>
            )}
          </div>
        </header>

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
      </div>

      {/* Time / Yield stats — full-width band; -mx cancels layout <main>'s padding */}
      <TimeYieldStats
        className="-mx-4 sm:-mx-6"
        prepTime={prepTime}
        cookTime={cookTime}
        totalTime={totalTime}
        recipeYield={schema.recipeYield}
        currentServings={scalable.currentServings}
        onServingsChange={scalePortionsTo}
      />

      <div className="max-w-3xl lg:max-w-5xl mx-auto">
        {/* Recipe Controls — logged-in only */}
        {isLoggedIn && (
          <RecipeControls
            isEditing={isEditing}
            editState={editState}
            canSave={editor.canSave}
            draftUrl={draft.url}
            draftStatus={draft.status}
            onUrlChange={(url) => patch({ url })}
            onStatusChange={(status) => patch({ status })}
            isRescrapeReview={isRescrapeReview}
            isRegenImageReview={isRegenImageReview}
            isUploadImageReview={isUploadImageReview}
            rescrapeState={rescrapeState}
            regenImageState={regenImageState}
            canRescrape={isMounted && recipe.url !== window.location.href}
            uploadError={imageUpload.error}
            fileInputRef={fileInputRef}
            onEditStart={handleEditStart}
            onEditSave={handleEditSave}
            onEditCancel={handleEditCancel}
            onRescrape={handleRescrape}
            onRegenImage={handleRegenImage}
            onUploadOpen={imageUpload.open}
            onFileSelected={handleFileSelected}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Ingredients */}
          {(isEditing ||
            (schema.recipeIngredient &&
              schema.recipeIngredient.length > 0)) && (
            <div className="sm:col-span-1">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl text-gray-900">Ingredients</h2>
                {!isEditing && (
                  <CopyShoppingListButton
                    onClick={copyShoppingList}
                    count={selectedIngredients.size}
                    copied={copyFeedback}
                  />
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
                      <h3 className="font-sans text-xs font-semibold uppercase tracking-widest text-brand mb-2">
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
                              className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${selected ? "bg-green-500" : "bg-brand"}`}
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
              <h2 className="text-xl text-gray-900 mb-4">Instructions</h2>
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
                        <h3 className="font-sans text-xs font-semibold uppercase tracking-widest text-brand mb-3">
                          {section.name}
                        </h3>
                        <ol className="space-y-3">
                          {section.itemListElement.map((step, j) => (
                            <li key={j} className="flex gap-4">
                              <span className="shrink-0 w-7 h-7 rounded-full bg-secondary-foreground text-white text-sm font-bold flex items-center justify-center">
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
                      <span className="shrink-0 w-7 h-7 rounded-full bg-secondary-foreground text-white text-sm font-bold flex items-center justify-center">
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
            <h2 className="text-xl text-gray-900 mb-3">Notes</h2>
            {isEditing ? (
              <Textarea
                value={draft.notes}
                onChange={(e) => patch({ notes: e.target.value })}
                disabled={editState === "saving"}
                placeholder="Add notes…"
                className="p-3 leading-relaxed min-h-[120px] resize-y"
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
      </div>
    </article>
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
