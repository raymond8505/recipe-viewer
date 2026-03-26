"use client";

import { useRef } from "react";
import type { RecipeRow } from "@/types/recipe";

interface MealTabsProps {
  recipes: RecipeRow[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
}

export default function MealTabs({ recipes, activeIndex, onSelect, onRemove }: MealTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next = (index + 1) % recipes.length;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      next = (index - 1 + recipes.length) % recipes.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      next = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      next = recipes.length - 1;
    } else {
      return;
    }
    tabRefs.current[next]?.focus();
    onSelect(next);
  };

  return (
    <div
      role="tablist"
      aria-label="Meal recipes"
      className="flex items-stretch gap-2 overflow-x-auto flex-wrap"
      style={{ scrollbarWidth: "none" }}
    >
      {recipes.map((recipe, index) => {
        const active = index === activeIndex;
        const hasClose = index > 0;
        const sharedBg = active
          ? "bg-orange-500 text-white"
          : "bg-gray-100 text-gray-700";

        return (
          <div key={recipe.id} className="flex items-stretch shrink-0">
            <button
              ref={(el) => { tabRefs.current[index] = el; }}
              role="tab"
              aria-selected={active}
              aria-controls="meal-recipe-panel"
              id={`meal-tab-${recipe.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(index)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={`min-h-[44px] py-2.5 text-sm font-medium transition-colors ${sharedBg} ${
                hasClose
                  ? "pl-4 pr-3 rounded-l-xl"
                  : "px-4 rounded-xl"
              } ${!active ? "active:bg-gray-200" : "active:bg-orange-600"}`}
            >
              <span className="truncate max-w-[140px] block">{recipe.metadata.schema.name}</span>
            </button>
            {hasClose && (
              <button
                onClick={() => {
                  const futureActive = index === activeIndex ? 0 : index < activeIndex ? activeIndex - 1 : activeIndex;
                  onRemove(index);
                  setTimeout(() => tabRefs.current[futureActive]?.focus(), 0);
                }}
                tabIndex={-1}
                aria-label={`Remove ${recipe.metadata.schema.name} from meal`}
                className={`min-h-[44px] px-2.5 rounded-r-xl text-sm transition-colors border-l ${sharedBg} ${
                  active
                    ? "border-orange-400 hover:bg-orange-600 active:bg-orange-700"
                    : "border-gray-200 hover:bg-gray-200 active:bg-gray-300"
                }`}
              >
                <CloseSmallIcon />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CloseSmallIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
