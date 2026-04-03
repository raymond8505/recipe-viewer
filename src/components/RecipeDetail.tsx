"use client";

import { useState } from "react";
import Image from "next/image";
import type { RecipeRow, HowToStep, HowToSection } from "@/types/recipe";
import {
  formatDuration,
  formatDate,
  getFirstImage,
  toArray,
  groupIngredients,
  getIngredientText,
  toSchemaOrgJsonLd,
  instructionsToMarkdown,
  markdownToInstructions,
  ingredientsToText,
  textToIngredients,
} from "@/lib/format";
import { useScaling } from "@/hooks/useScaling";
import CookingModeButton from "./CookingModeButton";
import IngredientItem from "./IngredientItem";
import ServingsControl from "./ServingsControl";
import NutritionPanel from "./NutritionPanel";

interface RecipeDetailProps {
  recipe: RecipeRow;
  isLoggedIn?: boolean;
}

type EditState = "idle" | "editing" | "saving" | "error";

export default function RecipeDetail({ recipe, isLoggedIn = false }: RecipeDetailProps) {
  const [schema, setSchema] = useState(recipe.metadata.schema);
  const [status, setStatus] = useState(recipe.status ?? "draft");
  const image = getFirstImage(schema.image);
  const prepTime = formatDuration(schema.prepTime);
  const cookTime = formatDuration(schema.cookTime);
  const totalTime = formatDuration(schema.totalTime);
  const categories = toArray(schema.recipeCategory);
  const { scale, servings, originalServings, setScale, setServings } = useScaling(schema.recipeYield);

  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [rescrapeState, setRescrapeState] = useState<"idle" | "loading" | "success" | "error">("idle");

  // Edit mode state
  const [editState, setEditState] = useState<EditState>("idle");
  const [editDesc, setEditDesc] = useState("");
  const [editIngredients, setEditIngredients] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("");

  const isEditing = editState !== "idle";

  const handleRescrape = async () => {
    setRescrapeState("loading");
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/rescrape`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { schema: updated } = await res.json();
      if (!updated) throw new Error();
      setSchema(updated);
      setRescrapeState("success");
    } catch {
      setRescrapeState("error");
    }
  };

  const handleEditStart = () => {
    setEditDesc(schema.description ?? "");
    setEditIngredients(ingredientsToText(schema.recipeIngredient ?? []));
    setEditInstructions(instructionsToMarkdown(schema.recipeInstructions ?? []));
    setEditNotes(schema.notes ?? "");
    setEditStatus(status);
    setEditState("editing");
  };

  const handleEditCancel = () => {
    setEditState("idle");
  };

  const handleEditSave = async () => {
    setEditState("saving");
    const updatedSchema = {
      ...schema,
      description: editDesc || undefined,
      recipeIngredient: textToIngredients(editIngredients),
      recipeInstructions: markdownToInstructions(editInstructions),
      notes: editNotes || undefined,
    };
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema: updatedSchema, status: editStatus }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (!result.schema) throw new Error();
      setSchema(result.schema);
      setStatus(result.status);
      setEditState("idle");
    } catch {
      setEditState("error");
    }
  };

  const toggleIngredient = (text: string) => {
    setSelectedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(text)) next.delete(text); else next.add(text);
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
    } catch { /* silent fail */ }
  };

  return (
    <article className="max-w-3xl mx-auto">
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
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
            {schema.name}
          </h1>
          <CookingModeButton recipe={recipe} />
        </div>

        {isEditing ? (
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
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
          {schema.author?.name && <span>By {schema.author.name}</span>}
          {schema.datePublished && (
            <span>{formatDate(schema.datePublished)}</span>
          )}
        </div>
      </header>

      {/* Image */}
      {image && (
        <div className="w-full rounded-2xl overflow-hidden mb-8 bg-gray-100">
          <Image
            src={image}
            alt={schema.name}
            width={0}
            height={0}
            sizes="(max-width: 768px) 100vw, 768px"
            className="w-full h-auto"
            priority
          />
        </div>
      )}

      {/* Time / Yield stats */}
      {(prepTime || cookTime || totalTime || schema.recipeYield) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 p-4 bg-orange-50 rounded-2xl">
          {prepTime && <Stat label="Prep time" value={prepTime} />}
          {cookTime && <Stat label="Cook time" value={cookTime} />}
          {totalTime && <Stat label="Total time" value={totalTime} />}
          {schema.recipeYield && (
            servings != null
              ? <ServingsControl servings={servings} onChange={setServings} />
              : <Stat label="Servings" value={Array.isArray(schema.recipeYield) ? schema.recipeYield[0] : schema.recipeYield} />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
        {/* Ingredients */}
        {(isEditing || (schema.recipeIngredient && schema.recipeIngredient.length > 0)) && (
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
              <textarea
                value={editIngredients}
                onChange={(e) => setEditIngredients(e.target.value)}
                disabled={editState === "saving"}
                placeholder={"One ingredient per line.\nUse ## Group Name for sections."}
                className="w-full rounded-lg border border-gray-200 p-3 font-mono text-sm text-gray-700 min-h-[200px] focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60 resize-y"
              />
            ) : (
              groupIngredients(schema.recipeIngredient!).map(({ heading, items }, gi) => (
                <div key={gi} className={gi > 0 ? "mt-4" : ""}>
                  {heading && (
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-2">
                      {heading}
                    </h3>
                  )}
                  <ul className="space-y-2">
                    {items.map((ingredient, i) => {
                      const text = getIngredientText(ingredient);
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
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${selected ? "bg-green-500" : "bg-orange-400"}`} />
                          <IngredientItem ingredient={text} scale={scale} onScaleChange={setScale} />
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
        {(isEditing || (schema.recipeInstructions && schema.recipeInstructions.length > 0)) && (
          <div className="sm:col-span-2">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Instructions
            </h2>
            {isEditing ? (
              <textarea
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                disabled={editState === "saving"}
                placeholder={"- Step one\n- Step two\n\n## Section Name\n- Step in section"}
                className="w-full rounded-lg border border-gray-200 p-3 font-mono text-sm text-gray-700 min-h-[300px] focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60 resize-y"
              />
            ) : schema.recipeInstructions![0]["@type"] === "HowToSection" ? (
              <div className="space-y-6">
                {(schema.recipeInstructions as HowToSection[]).map((section, i) => (
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
                ))}
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
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              disabled={editState === "saving"}
              placeholder="Add notes…"
              className="w-full rounded-lg border border-gray-200 p-3 text-gray-700 leading-relaxed min-h-[120px] focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60 resize-y"
            />
          ) : (
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">{schema.notes}</p>
          )}
        </div>
      )}

      {/* Nutrition — always read-only */}
      {schema.nutrition && <NutritionPanel nutrition={schema.nutrition} totalServings={originalServings} />}

      {/* Recipe Controls — logged-in only */}
      {isLoggedIn && (
        <section aria-label="Recipe management" className="mt-12 pt-6 border-t border-gray-100">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
            Manage
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {isEditing ? (
              <>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
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
                  disabled={editState === "saving"}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {editState === "saving" ? "Saving\u2026" : "Save"}
                </button>
                <button
                  onClick={handleEditCancel}
                  disabled={editState === "saving"}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                {editState === "error" && (
                  <span className="text-sm text-red-600">Save failed. Try again.</span>
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
                <button
                  onClick={handleRescrape}
                  disabled={rescrapeState === "loading"}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {rescrapeState === "loading" ? "Re-scraping\u2026" : "Re-scrape"}
                </button>
                {rescrapeState === "success" && (
                  <span className="text-sm text-green-600">Recipe updated.</span>
                )}
                {rescrapeState === "error" && (
                  <span className="text-sm text-red-600">Re-scrape failed. Try again.</span>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* JSON-LD — Schema.org-compliant only; escape </script> sequences to prevent tag injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(toSchemaOrgJsonLd(schema), null, 2).replace(/</g, "\\u003c") }}
      />
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
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

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}
