"use client";

import type { RecipeRow } from "@/types/recipe";
import type { RoundPresentation } from "@/hooks/useHeadsUp";
import HeadsUpFighterCard from "./HeadsUpFighterCard";

interface HeadsUpArenaProps {
  round: RoundPresentation;
  roundNumber: number;
  pool: RecipeRow[];
  selectedId: string | null;
  isConfirming: boolean;
  isDeciding: boolean;
  prompt: string;
  onSelect: (recipeId: string) => void;
}

export default function HeadsUpArena({
  round,
  roundNumber,
  pool,
  selectedId,
  isConfirming,
  isDeciding,
  prompt,
  onSelect,
}: HeadsUpArenaProps) {
  const [leftOption, rightOption] = round.options;
  const leftRecipe = pool.find((r) => r.id === leftOption.id);
  const rightRecipe = pool.find((r) => r.id === rightOption.id);

  if (!leftRecipe || !rightRecipe) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header: round number + label */}
      <div className="flex items-center justify-center px-6 py-3 shrink-0">
        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">
            Round {roundNumber}
          </span>
          <h2 className="text-lg font-semibold text-gray-200 mt-0.5">
            {round.label}
          </h2>
        </div>
      </div>

      {/* Arena: two cards with VS in between */}
      <div className="flex-1 flex items-stretch gap-0 px-6 pb-4 min-h-0">
        {/* Left fighter */}
        <div className="flex-1 min-w-0">
          <HeadsUpFighterCard
            recipe={leftRecipe}
            optionLabel={leftOption.label}
            position="left"
            isSelected={selectedId === leftOption.id}
            isConfirmed={isConfirming && selectedId === leftOption.id}
            onClick={() => onSelect(leftOption.id)}
          />
        </div>

        {/* VS divider */}
        <div className="flex items-center justify-center px-4 shrink-0">
          <div className="flex flex-col items-center gap-1">
            <div className="w-px h-8 bg-gradient-to-b from-transparent via-orange-500 to-transparent" />
            <span className="text-3xl font-black text-orange-500 drop-shadow-[0_0_12px_rgba(249,115,22,0.6)] select-none">
              VS
            </span>
            <div className="w-px h-8 bg-gradient-to-b from-transparent via-orange-500 to-transparent" />
          </div>
        </div>

        {/* Right fighter */}
        <div className="flex-1 min-w-0">
          <HeadsUpFighterCard
            recipe={rightRecipe}
            optionLabel={rightOption.label}
            position="right"
            isSelected={selectedId === rightOption.id}
            isConfirmed={isConfirming && selectedId === rightOption.id}
            onClick={() => onSelect(rightOption.id)}
          />
        </div>
      </div>

      {/* Footer: original prompt + deciding overlay hint */}
      <div className="flex items-center justify-center px-6 py-2 shrink-0">
        <p className="text-xs text-gray-500 italic">
          &ldquo;{prompt}&rdquo;
        </p>
      </div>

      {/* Deciding overlay */}
      {isDeciding && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/70 z-10 rounded-none">
          <div className="flex flex-col items-center gap-3">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="text-orange-400 animate-spin"
            >
              <path d="M12 2v4" />
              <path d="m16.24 7.76 2.83-2.83" opacity=".3" />
              <path d="M18 12h4" opacity=".3" />
              <path d="m16.24 16.24 2.83 2.83" opacity=".3" />
              <path d="M12 18v4" opacity=".3" />
              <path d="m7.76 16.24-2.83 2.83" opacity=".3" />
              <path d="M6 12H2" opacity=".3" />
              <path d="m7.76 7.76-2.83-2.83" opacity=".3" />
            </svg>
            <span className="text-sm font-bold uppercase tracking-wider text-orange-400">
              Deciding next round&hellip;
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
