"use client";

import { useRef } from "react";
import type { RecipeRow } from "@/types/recipe";
import { CloseSmallIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
          ? "bg-brand text-white"
          : "bg-muted text-gray-700";

        return (
          <div key={recipe.id} className="flex items-stretch shrink-0">
            <Button
              ref={(el) => { tabRefs.current[index] = el; }}
              variant="ghost"
              role="tab"
              aria-selected={active}
              aria-controls="meal-recipe-panel"
              id={`meal-tab-${recipe.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(index)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={cn(
                "h-auto min-h-[44px] py-2.5 text-sm font-medium",
                sharedBg,
                hasClose ? "rounded-l-full rounded-r-none pl-4 pr-3" : "px-4",
                active
                  ? "hover:bg-brand hover:text-white active:bg-brand/90"
                  : "hover:bg-muted hover:text-gray-700 active:bg-gray-200",
              )}
            >
              <span className="truncate max-w-[140px] block">{recipe.metadata.schema.name}</span>
            </Button>
            {hasClose && (
              <Button
                variant="ghost"
                onClick={() => {
                  const futureActive = index === activeIndex ? 0 : index < activeIndex ? activeIndex - 1 : activeIndex;
                  onRemove(index);
                  setTimeout(() => tabRefs.current[futureActive]?.focus(), 0);
                }}
                tabIndex={-1}
                aria-label={`Remove ${recipe.metadata.schema.name} from meal`}
                className={cn(
                  "h-auto min-h-[44px] rounded-l-none rounded-r-full border-l px-2.5 text-sm",
                  sharedBg,
                  active
                    ? "border-brand/60 hover:bg-brand/90 hover:text-white active:bg-brand/80"
                    : "border-border hover:bg-gray-200 hover:text-gray-700 active:bg-gray-300",
                )}
              >
                <CloseSmallIcon />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
