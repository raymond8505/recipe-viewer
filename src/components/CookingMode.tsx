"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import Image from "next/image";
import type { RecipeRow, HowToStep, HowToSection } from "@/types/recipe";
import {
  formatDuration,
  formatDate,
  getFirstImage,
  toArray,
  parseDurationToSeconds,
  getIngredientText,
} from "@/lib/format";
import { useTimers, timerState } from "@/hooks/useTimers";
import type { Timer } from "@/hooks/useTimers";
import { ScalableRecipe } from "@/lib/ScalableRecipe";
import { useWakeLock } from "@/hooks/useWakeLock";
import { registerCookingModeRecipe, unregisterCookingModeRecipe } from "@/lib/windowApi";
import TimerColumn from "@/components/cooking/TimerColumn";
import TimerCard from "@/components/cooking/TimerCard";
import AddTimerModal from "@/components/cooking/AddTimerModal";
import DraggableRibbon from "@/components/cooking/DraggableRibbon";
import MealSearch from "@/components/cooking/MealSearch";
import MealTabs from "@/components/cooking/MealTabs";
import { CheckIcon, CopyIcon, CloseIcon, SmallPlusIcon, EnterFullscreenIcon, ExitFullscreenIcon } from "@/components/icons";
import IngredientItem from "@/components/IngredientItem";
import ServingsControl from "@/components/ServingsControl";
import NutritionPanel from "@/components/NutritionPanel";

interface CookingModeProps {
  recipe: RecipeRow;
  onClose: () => void;
  isLoggedIn?: boolean;
}

const TIMER_PRIORITY = { alarm: 0, running: 1, paused: 2, finished: 3 } as const;
function sortedTimers(timers: Timer[]): Timer[] {
  return [...timers].sort((a, b) => TIMER_PRIORITY[timerState(a)] - TIMER_PRIORITY[timerState(b)]);
}

export default function CookingMode({ recipe, onClose, isLoggedIn = false }: CookingModeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingScrollId = useRef<string | null>(null);
  // Fullscreen state is always derived from the real browser state via the event.
  // Initialize from current DOM state so it's correct even if fullscreen was
  // entered before this component mounted.
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== "undefined" && document.fullscreenElement != null
  );
  const [showAddTimer, setShowAddTimer] = useState(false);
  const [editingTimer, setEditingTimer] = useState<Timer | null>(null);
  const { timers, addTimer, editTimer, togglePause, resetTimer, dismissTimer, removeTimer, removeTimers, resetAll } = useTimers(recipe.url);

  const [schema, setSchema] = useState(recipe.metadata.schema);
  const [cookingNotes, setCookingNotes] = useState(() => recipe.metadata.schema.cookingNotes ?? "");
  const [notesSaveState, setNotesSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const notesFirstRender = useRef(true);

  // Meal state — primary recipe is always at index 0 and cannot be removed
  const [mealRecipes, setMealRecipes] = useState<RecipeRow[]>([recipe]);
  const [activeIndex, setActiveIndex] = useState(0);
  // Maps recipe.id → timer IDs that were seeded when that recipe was added to the meal
  const [mealTimerIds, setMealTimerIds] = useState<Map<string, string[]>>(() => new Map());

  // Per-recipe ScalableRecipe instances. Primary is seeded immediately; secondaries
  // are seeded inside handleAddToMeal so the lookup never misses. The primary's
  // ingredient scale drives the UI; secondary recipes' scale is intentionally
  // pinned at 1 by suppressing the controls (see below).
  const [scalables, setScalables] = useState<Map<string, ScalableRecipe>>(
    () => new Map([[recipe.id, new ScalableRecipe(recipe.metadata.schema)]]),
  );

  // When the primary schema is swapped (e.g. window API setRecipeViewerRecipe),
  // rebuild its ScalableRecipe at default state — the previous scale was anchored
  // to a now-stale yield and would silently produce wrong numbers.
  useEffect(() => {
    setScalables((prev) => {
      const next = new Map(prev);
      next.set(recipe.id, new ScalableRecipe(schema));
      return next;
    });
  }, [schema, recipe.id]);

  const primaryScalable = scalables.get(recipe.id)!;
  const activeScalable = scalables.get(mealRecipes[activeIndex].id)!;
  const activeSchema = activeScalable.schema;

  const updateScalable = (id: string, fn: (r: ScalableRecipe) => ScalableRecipe) =>
    setScalables((prev) => {
      const existing = prev.get(id);
      if (!existing) return prev;
      const next = fn(existing);
      if (next === existing) return prev;
      const updated = new Map(prev);
      updated.set(id, next);
      return updated;
    });

  // Maps timer ID → recipe name; only populated in meal mode (2+ recipes).
  // Added-recipe timers are tracked in mealTimerIds; any timer not found there
  // belongs to the primary recipe.
  const timerRecipeNames = useMemo((): Map<string, string> => {
    if (mealRecipes.length <= 1) return new Map();
    const map = new Map<string, string>();
    for (const [recipeId, ids] of mealTimerIds) {
      const r = mealRecipes.find((r) => r.id === recipeId);
      if (r) ids.forEach((id) => map.set(id, r.metadata.schema.name));
    }
    const primaryName = schema.name;
    for (const t of timers) {
      if (!map.has(t.id)) map.set(t.id, primaryName);
    }
    return map;
  }, [mealRecipes, mealTimerIds, timers, schema.name]);

  useWakeLock();

  useEffect(() => {
    if (notesFirstRender.current) { notesFirstRender.current = false; return; }
    const t = setTimeout(async () => {
      setNotesSaveState("saving");
      try {
        const res = await fetch(`/api/recipes/${recipe.id}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cookingNotes }),
        });
        if (!res.ok) throw new Error();
        setNotesSaveState("saved");
        setTimeout(() => setNotesSaveState("idle"), 2000);
      } catch {
        setNotesSaveState("error");
      }
    }, 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookingNotes]);

  useEffect(() => {
    registerCookingModeRecipe(recipe.metadata.schema, setSchema);
    return () => unregisterCookingModeRecipe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed timers from steps that declare both name + timeRequired, but only
  // if no timers are already stored for this recipe.
  useEffect(() => {
    if (timers.length > 0) return;
    for (const item of schema.recipeInstructions ?? []) {
      const steps =
        item["@type"] === "HowToSection"
          ? (item as HowToSection).itemListElement
          : [item as HowToStep];
      for (const step of steps) {
        const secs = parseDurationToSeconds(step.timeRequired);
        if (step.name && secs) addTimer(step.name, secs, true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shopping list — single Set across all meal recipes; key = "${recipeId}::${ingredientText}"
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState(false);

  const toggleIngredient = (recipeId: string, text: string) => {
    const key = `${recipeId}::${text}`;
    setSelectedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const copyShoppingList = async () => {
    const lines: string[] = [];
    for (const r of mealRecipes) {
      const ings = r.id === recipe.id ? schema.recipeIngredient : r.metadata.schema.recipeIngredient;
      for (const ing of (ings ?? [])) {
        const text = getIngredientText(ing);
        if (selectedIngredients.has(`${r.id}::${text}`)) lines.push(text);
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch { /* silent fail */ }
  };

  // Instruction completion — not persisted between sessions, tracked per recipe
  const [completedStepsMap, setCompletedStepsMap] = useState<Map<string, Set<string>>>(
    () => new Map([[recipe.id, new Set<string>()]])
  );
  const completedSteps = completedStepsMap.get(mealRecipes[activeIndex].id) ?? new Set<string>();

  const toggleStep = (key: string) => {
    const id = mealRecipes[activeIndex].id;
    setCompletedStepsMap((prev) => {
      const next = new Map(prev);
      const bucket = new Set(next.get(id) ?? []);
      if (bucket.has(key)) bucket.delete(key);
      else bucket.add(key);
      next.set(id, bucket);
      return next;
    });
  };

  const handleAddToMeal = (newRecipe: RecipeRow) => {
    setMealRecipes((prev) => [...prev, newRecipe]);
    setCompletedStepsMap((prev) => new Map(prev).set(newRecipe.id, new Set()));
    setScalables((prev) =>
      new Map(prev).set(newRecipe.id, new ScalableRecipe(newRecipe.metadata.schema)),
    );
    // Seed this recipe's timers unconditionally (bypass the "skip if timers > 0" guard on mount)
    const seededIds: string[] = [];
    for (const item of newRecipe.metadata.schema.recipeInstructions ?? []) {
      const steps =
        item["@type"] === "HowToSection"
          ? (item as HowToSection).itemListElement
          : [item as HowToStep];
      for (const step of steps) {
        const secs = parseDurationToSeconds(step.timeRequired);
        if (step.name && secs) seededIds.push(addTimer(step.name, secs, true));
      }
    }
    if (seededIds.length > 0) {
      setMealTimerIds((prev) => new Map(prev).set(newRecipe.id, seededIds));
    }
  };

  const handleRemoveFromMeal = (index: number) => {
    if (index === 0) return;
    const removed = mealRecipes[index];
    const timerIds = mealTimerIds.get(removed.id);
    if (timerIds && timerIds.length > 0) {
      removeTimers(timerIds);
      setMealTimerIds((prev) => {
        const next = new Map(prev);
        next.delete(removed.id);
        return next;
      });
    }
    setSelectedIngredients((prev) => {
      const next = new Set(prev);
      for (const key of next) {
        if (key.startsWith(`${removed.id}::`)) next.delete(key);
      }
      return next;
    });
    setScalables((prev) => {
      const next = new Map(prev);
      next.delete(removed.id);
      return next;
    });
    setMealRecipes((prev) => prev.filter((_, i) => i !== index));
    setActiveIndex((prev) => (prev === index ? 0 : prev > index ? prev - 1 : prev));
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
    return () => {
      document.body.style.overflow = "";
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!pendingScrollId.current) return;
    const els = document.querySelectorAll(`[data-timer-id="${pendingScrollId.current}"]`);
    if (els.length > 0) {
      els.forEach((el) =>
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
      );
      pendingScrollId.current = null;
    }
  }, [timers]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  };

  const image = getFirstImage(schema.image);
  const prepTime = formatDuration(schema.prepTime);
  const cookTime = formatDuration(schema.cookTime);
  const totalTime = formatDuration(schema.totalTime);
  const categories = toArray(schema.recipeCategory);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-white flex flex-col cook-mode-container"
      style={{ width: "100vw" }}
    >
      {/* Sticky header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
        <button
          onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); }}
          className="text-sm font-medium text-gray-500"
        >Cooking mode</button>
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
            {sortedTimers(timers).map((timer) => (
              <div key={timer.id} data-timer-id={timer.id} className="snap-start shrink-0 w-44">
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
                  recipeName={timerRecipeNames.get(timer.id)}
                />
              </div>
            ))}
          </DraggableRibbon>
        ) : (
          <p className="text-xs text-gray-400 text-center pb-2">No timers yet</p>
        )}
      </div>

      {/* Mobile cooking notes — sticky below timer ribbon, above scrollable content (logged-in only) */}
      {isLoggedIn && (
        <div className="lg:hidden shrink-0 bg-white border-b border-gray-200 px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cooking notes</p>
            {notesSaveState === "saving" && <span className="text-xs text-gray-400">Saving…</span>}
            {notesSaveState === "saved" && <span className="text-xs text-green-500">Saved ✓</span>}
            {notesSaveState === "error" && <span className="text-xs text-red-500">Error saving</span>}
          </div>
          <textarea
            value={cookingNotes}
            onChange={(e) => setCookingNotes(e.target.value)}
            placeholder="Note changes for next time…"
            rows={3}
            className="w-full resize-none text-sm text-gray-700 placeholder-gray-400 focus:outline-none leading-relaxed"
          />
        </div>
      )}

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
                  primaryScalable.currentServings != null
                    ? <ServingsControl
                        servings={primaryScalable.currentServings}
                        onChange={(n) => updateScalable(recipe.id, (r) => r.scalePortionsTo(n))}
                      />
                    : <Stat label="Servings" value={Array.isArray(schema.recipeYield) ? schema.recipeYield[0] : schema.recipeYield} />
                )}
              </div>
            )}

            {/* Meal bar — tabs and search inline */}
            <div className="flex items-start gap-2 flex-wrap mb-6">
              {mealRecipes.length > 1 && (
                <MealTabs
                  recipes={mealRecipes}
                  activeIndex={activeIndex}
                  onSelect={setActiveIndex}
                  onRemove={handleRemoveFromMeal}
                />
              )}
              <div className="relative flex-1 min-w-[200px]">
                <MealSearch
                  excludeIds={new Set(mealRecipes.map((r) => r.id))}
                  onAdd={handleAddToMeal}
                />
              </div>
            </div>

            <div
              id="meal-recipe-panel"
              role={mealRecipes.length > 1 ? "tabpanel" : undefined}
              aria-labelledby={mealRecipes.length > 1 ? `meal-tab-${mealRecipes[activeIndex].id}` : undefined}
              tabIndex={mealRecipes.length > 1 ? 0 : undefined}
              className="grid grid-cols-1 sm:grid-cols-3 gap-8"
            >
              {/* Ingredients */}
              {activeSchema.recipeIngredient && activeSchema.recipeIngredient.length > 0 && (
                <div className="sm:col-span-1">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl sm:text-xl font-semibold text-gray-900">
                      Ingredients
                    </h2>
                    <button
                      onClick={copyShoppingList}
                      disabled={selectedIngredients.size === 0}
                      className={`p-2 rounded-lg transition-colors ${selectedIngredients.size === 0 ? "invisible" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
                      aria-label={`Copy shopping list, ${selectedIngredients.size} item${selectedIngredients.size === 1 ? "" : "s"}`}
                    >
                      {copyFeedback ? <CheckIcon size={14} /> : <CopyIcon />}
                    </button>
                  </div>
                  {activeScalable.groupedIngredients.map(({ heading, items }, gi) => (
                    <div key={gi} className={gi > 0 ? "mt-4" : ""}>
                      {heading && (
                        <h3 className="text-sm sm:text-xs font-semibold uppercase tracking-widest text-orange-500 mb-2">
                          {heading}
                        </h3>
                      )}
                      <ul className="space-y-2">
                        {items.map((ing, i) => {
                          const text = ing.original;
                          const selected = selectedIngredients.has(`${mealRecipes[activeIndex].id}::${text}`);
                          return (
                            <li
                              key={i}
                              className={`flex items-start gap-2 text-lg sm:text-sm rounded-lg px-2 py-1 -mx-2 cursor-pointer select-none transition-colors active:opacity-60 ${selected ? "bg-green-50 text-gray-700" : "text-gray-700"}`}
                              onClick={() => toggleIngredient(mealRecipes[activeIndex].id, text)}
                              role="checkbox"
                              aria-checked={selected}
                              aria-label={text}
                            >
                              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${selected ? "bg-green-500" : "bg-orange-400"}`} />
                              <IngredientItem
                                ingredient={ing}
                                onAnchor={
                                  activeIndex === 0
                                    ? (amount) =>
                                        updateScalable(recipe.id, (r) =>
                                          r.anchorIngredientAmount(ing.index, amount),
                                        )
                                    : undefined
                                }
                              />
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* Instructions */}
              {activeSchema.recipeInstructions && activeSchema.recipeInstructions.length > 0 && (
                <div className="sm:col-span-2">
                  <h2 className="text-2xl sm:text-xl font-semibold text-gray-900 mb-4">
                    Instructions
                  </h2>
                  {activeSchema.recipeInstructions[0]["@type"] === "HowToSection" ? (
                    <div className="space-y-6">
                      {(activeSchema.recipeInstructions as HowToSection[]).map((section, i) => (
                        <div key={i}>
                          <h3 className="text-sm sm:text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
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
                                  <span className={`shrink-0 w-8 h-8 sm:w-7 sm:h-7 rounded-full text-base sm:text-sm font-bold flex items-center justify-center transition-colors ${done ? "bg-green-500 text-white" : "bg-orange-500 text-white"}`}>
                                    {done ? <CheckIcon size={14} /> : j + 1}
                                  </span>
                                  <p className={`text-xl sm:text-base leading-relaxed pt-0.5 transition-colors ${done ? "line-through text-gray-400" : "text-gray-700"}`}>
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
                      {(activeSchema.recipeInstructions as HowToStep[]).map((step, i) => {
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
                            <span className={`shrink-0 w-8 h-8 sm:w-7 sm:h-7 rounded-full text-base sm:text-sm font-bold flex items-center justify-center transition-colors ${done ? "bg-green-500 text-white" : "bg-orange-500 text-white"}`}>
                              {done ? <CheckIcon size={14} /> : i + 1}
                            </span>
                            <p className={`text-xl sm:text-base leading-relaxed pt-0.5 transition-colors ${done ? "line-through text-gray-400" : "text-gray-700"}`}>
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

            {/* Notes */}
            {activeSchema.notes && (
              <div className="mt-8">
                <h2 className="text-2xl sm:text-xl font-semibold text-gray-900 mb-3">Notes</h2>
                <p className="text-xl sm:text-base text-gray-700 leading-relaxed whitespace-pre-line">{activeSchema.notes}</p>
              </div>
            )}

            {/* Nutrition */}
            {schema.nutrition && <NutritionPanel nutrition={schema.nutrition} totalServings={primaryScalable.baseServings} />}
          </div>
        </div>

        {/* Right column — timers (desktop only) */}
        <div className="hidden lg:flex lg:flex-col w-1/4">
          <TimerColumn
            timers={sortedTimers(timers)}
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
            timerRecipeNames={timerRecipeNames}
            {...(isLoggedIn && {
              cookingNotes,
              onNotesChange: setCookingNotes,
              notesSaveState,
            })}
          />
        </div>

      </div>{/* end main content row */}

      {/* Modals — children of cooking mode wrapper, not the column */}
      {showAddTimer && (
        <AddTimerModal
          onAdd={(label, duration) => {
            pendingScrollId.current = addTimer(label, duration);
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
