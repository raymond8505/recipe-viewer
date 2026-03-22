"use client";

import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import type { RecipeRow, HowToStep, HowToSection } from "@/types/recipe";
import {
  formatDuration,
  formatDate,
  getFirstImage,
  toArray,
} from "@/lib/format";
import { useTimers } from "@/hooks/useTimers";
import type { Timer } from "@/hooks/useTimers";
import TimerColumn from "@/components/cooking/TimerColumn";
import TimerCard from "@/components/cooking/TimerCard";
import AddTimerModal from "@/components/cooking/AddTimerModal";
import DraggableRibbon from "@/components/cooking/DraggableRibbon";

interface CookingModeProps {
  recipe: RecipeRow;
  onClose: () => void;
}

export default function CookingMode({ recipe, onClose }: CookingModeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Fullscreen state is always derived from the real browser state via the event.
  // Initialize from current DOM state so it's correct even if fullscreen was
  // entered before this component mounted.
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== "undefined" && document.fullscreenElement != null
  );
  const [showAddTimer, setShowAddTimer] = useState(false);
  const [editingTimer, setEditingTimer] = useState<Timer | null>(null);
  const { timers, addTimer, editTimer, togglePause, resetTimer, dismissTimer, removeTimer, resetAll } = useTimers(recipe.url);

  // Instruction completion — not persisted between sessions
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const toggleStep = (key: string) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      // Compare against our container so we only react to our own fullscreen state
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    containerRef.current?.requestFullscreen().catch(() => {});
    return () => {
      document.body.style.overflow = "";
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  };

  const { metadata: { schema } } = recipe;
  const image = getFirstImage(schema.image);
  const prepTime = formatDuration(schema.prepTime);
  const cookTime = formatDuration(schema.cookTime);
  const totalTime = formatDuration(schema.totalTime);
  const categories = toArray(schema.recipeCategory);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-white flex flex-col"
      style={{ width: "100vw", height: "100vh" }}
    >
      {/* Sticky header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
        <span className="text-sm font-medium text-gray-500">Cooking mode</span>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
            title="Exit cooking mode"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Mobile timer ribbon — sticky below header, only on small screens */}
      <div className="lg:hidden shrink-0 bg-white border-b border-gray-200">
        {/* Add timer + Reset all — inline, add timer grows */}
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          <button
            onClick={() => setShowAddTimer(true)}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-1.5"
          >
            <SmallPlusIcon />
            Add Timer
          </button>
          {timers.length > 0 && (
            <button
              onClick={resetAll}
              className="shrink-0 py-2.5 px-3 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm font-medium transition-colors whitespace-nowrap"
            >
              Reset All
            </button>
          )}
        </div>
        {/* Horizontal scrollable timer cards */}
        {timers.length > 0 ? (
          <DraggableRibbon className="px-3 pb-3 pt-1 gap-2">
            {timers.map((timer) => (
              <div key={timer.id} className="snap-start shrink-0 w-44">
                <TimerCard
                  timer={timer}
                  onTogglePause={togglePause}
                  onReset={resetTimer}
                  onRemove={removeTimer}
                  onDismiss={dismissTimer}
                  onEdit={(id) => {
                    const t = timers.find((t) => t.id === id);
                    if (t) setEditingTimer(t);
                  }}
                />
              </div>
            ))}
          </DraggableRibbon>
        ) : (
          <p className="text-xs text-gray-400 text-center pb-2">No timers yet</p>
        )}
      </div>

      {/* Main content row */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Recipe content — full width on mobile, 3/4 on desktop */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
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

              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-4">
                {schema.name}
              </h1>

              {schema.description && (
                <p className="text-gray-600 text-lg leading-relaxed">
                  {schema.description}
                </p>
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
                  <Stat
                    label="Servings"
                    value={
                      Array.isArray(schema.recipeYield)
                        ? schema.recipeYield[0]
                        : schema.recipeYield
                    }
                  />
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {/* Ingredients */}
              {schema.recipeIngredient && schema.recipeIngredient.length > 0 && (
                <div className="sm:col-span-1">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Ingredients
                  </h2>
                  <ul className="space-y-2">
                    {schema.recipeIngredient.map((ingredient, i) => (
                      <li key={i} className="flex items-start gap-2 text-base sm:text-sm text-gray-700">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                        {ingredient}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Instructions */}
              {schema.recipeInstructions && schema.recipeInstructions.length > 0 && (
                <div className="sm:col-span-2">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Instructions
                  </h2>
                  {schema.recipeInstructions[0]["@type"] === "HowToSection" ? (
                    <div className="space-y-6">
                      {(schema.recipeInstructions as HowToSection[]).map((section, i) => (
                        <div key={i}>
                          <h3 className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
                            {section.name}
                          </h3>
                          <ol className="space-y-3">
                            {section.itemListElement.map((step, j) => {
                              const key = `${i}-${j}`;
                              const done = completedSteps.has(key);
                              return (
                                <li
                                  key={j}
                                  className="flex gap-4 active:opacity-60"
                                  onClick={() => toggleStep(key)}
                                  role="button"
                                  aria-pressed={done}
                                  aria-label={`Step ${j + 1}: ${done ? "completed" : "mark complete"}`}
                                >
                                  <span className={`shrink-0 w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center transition-colors ${done ? "bg-green-500 text-white" : "bg-orange-500 text-white"}`}>
                                    {done ? <CheckIcon /> : j + 1}
                                  </span>
                                  <p className={`text-base sm:text-sm leading-relaxed pt-0.5 transition-colors ${done ? "line-through text-gray-400" : "text-gray-700"}`}>
                                    {step.text}
                                  </p>
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ol className="space-y-4">
                      {(schema.recipeInstructions as HowToStep[]).map((step, i) => {
                        const key = `${i}`;
                        const done = completedSteps.has(key);
                        return (
                          <li
                            key={i}
                            className="flex gap-4 active:opacity-60"
                            onClick={() => toggleStep(key)}
                            role="button"
                            aria-pressed={done}
                            aria-label={`Step ${i + 1}: ${done ? "completed" : "mark complete"}`}
                          >
                            <span className={`shrink-0 w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center transition-colors ${done ? "bg-green-500 text-white" : "bg-orange-500 text-white"}`}>
                              {done ? <CheckIcon /> : i + 1}
                            </span>
                            <p className={`text-base sm:text-sm leading-relaxed pt-0.5 transition-colors ${done ? "line-through text-gray-400" : "text-gray-700"}`}>
                              {step.text}
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              )}
            </div>

            {/* Nutrition */}
            {schema.nutrition && hasNutritionData(schema.nutrition) && (
              <div className="mt-8 p-4 border border-gray-200 rounded-2xl">
                <div className="flex items-baseline gap-2 mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">Nutrition</h2>
                  <span className="text-sm text-gray-500">per serving</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  {schema.nutrition.calories && (
                    <NutritionStat label="Calories" value={schema.nutrition.calories} />
                  )}
                  {schema.nutrition.proteinContent && (
                    <NutritionStat label="Protein" value={schema.nutrition.proteinContent} />
                  )}
                  {schema.nutrition.carbohydrateContent && (
                    <NutritionStat label="Carbs" value={schema.nutrition.carbohydrateContent} />
                  )}
                  {schema.nutrition.fatContent && (
                    <NutritionStat label="Fat" value={schema.nutrition.fatContent} />
                  )}
                  {schema.nutrition.fiberContent && (
                    <NutritionStat label="Fiber" value={schema.nutrition.fiberContent} />
                  )}
                  {schema.nutrition.sodiumContent && (
                    <NutritionStat label="Sodium" value={schema.nutrition.sodiumContent} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column — timers (desktop only) */}
        <div className="hidden lg:flex lg:flex-col w-1/4">
          <TimerColumn
            timers={timers}
            onAddTimer={() => setShowAddTimer(true)}
            onEditTimer={(id) => {
              const t = timers.find((t) => t.id === id);
              if (t) setEditingTimer(t);
            }}
            onTogglePauseTimer={togglePause}
            onResetTimer={resetTimer}
            onRemoveTimer={removeTimer}
            onDismissTimer={dismissTimer}
            onResetAll={resetAll}
          />
        </div>

      </div>{/* end main content row */}

      {/* Modals — children of cooking mode wrapper, not the column */}
      {showAddTimer && (
        <AddTimerModal
          onAdd={(label, duration) => {
            addTimer(label, duration);
            setShowAddTimer(false);
          }}
          onClose={() => setShowAddTimer(false)}
        />
      )}
      {editingTimer && (
        <AddTimerModal
          initialLabel={editingTimer.label}
          initialSeconds={editingTimer.duration}
          onAdd={(label, duration) => {
            editTimer(editingTimer.id, label, duration);
            setEditingTimer(null);
          }}
          onClose={() => setEditingTimer(null)}
        />
      )}
    </div>
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

function hasNutritionData(
  n: NonNullable<RecipeRow["metadata"]["schema"]["nutrition"]>
): boolean {
  return !!(
    n.calories ||
    n.proteinContent ||
    n.carbohydrateContent ||
    n.fatContent ||
    n.fiberContent ||
    n.sodiumContent
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SmallPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function EnterFullscreenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
