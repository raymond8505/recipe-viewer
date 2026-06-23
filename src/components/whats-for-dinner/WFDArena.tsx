"use client";

import type { RecipeRow } from "@/types/recipe";
import type { WFDPhase } from "@/types/whats-for-dinner";
import WFDCard from "./WFDCard";

interface WFDArenaProps {
  contenders: RecipeRow[];
  losingIndices: number[];
  phase: WFDPhase;
  onPick: (index: number) => void;
}

export default function WFDArena({
  contenders,
  losingIndices,
  phase,
  onPick,
}: WFDArenaProps) {
  const isLoading = phase === "loading";

  return (
    <div className="flex-1 flex items-stretch gap-3 px-4 pb-4 min-h-0">
      {contenders.map((recipe, index) => {
        const isLosing = isLoading && losingIndices.includes(index);
        const isLast = index === contenders.length - 1;

        return (
          <div key={recipe.id} className="contents">
            {/* Slot — overflow-hidden clips the vertical slide animations */}
            <div className="flex-1 min-w-0 flex items-stretch overflow-hidden">
              {/*
               * This inner wrapper is keyed by recipe.id.
               * When the backend returns a new recipe at this index the id
               * changes, React remounts the element, and animate-wfd-slide-in
               * fires on the fresh mount.
               * During loading the loser slot keeps the old id (no remount)
               * but receives animate-wfd-slide-out to exit visually.
               */}
              <div
                key={recipe.id}
                className={`w-full ${isLosing ? "animate-wfd-slide-out" : "animate-wfd-slide-in"}`}
              >
                <WFDCard
                  recipe={recipe}
                  onClick={() => onPick(index)}
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Divider between cards */}
            {!isLast && (
              <div className="flex items-center justify-center px-1 shrink-0">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-px h-10 bg-linear-to-b from-transparent via-gray-600 to-transparent" />
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-widest select-none">
                    or
                  </span>
                  <div className="w-px h-10 bg-linear-to-b from-transparent via-gray-600 to-transparent" />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
