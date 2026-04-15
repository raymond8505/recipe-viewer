"use client";

import type { RecipeRow } from "@/types/recipe";
import type { Matchup } from "@/types/headsup";
import HeadsUpFighterCard from "./HeadsUpFighterCard";

interface HeadsUpArenaProps {
  matchup: Matchup;
  roundNumber: number;
  matchupIndex: number;
  matchupCount: number;
  pool: RecipeRow[];
  selectedId: string | null;
  isConfirming: boolean;
  prompt: string;
  onSelect: (recipeId: string) => void;
}

export default function HeadsUpArena({
  matchup,
  roundNumber,
  matchupIndex,
  matchupCount,
  pool,
  selectedId,
  isConfirming,
  prompt,
  onSelect,
}: HeadsUpArenaProps) {
  const leftRecipe = pool.find((r) => r.id === matchup.id1);
  const rightRecipe = pool.find((r) => r.id === matchup.id2);

  if (!leftRecipe || !rightRecipe) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header: round + matchup progress */}
      <div className="flex items-center justify-center px-6 py-3 shrink-0">
        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">
            Round {roundNumber}
          </span>
          {matchupCount > 1 && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              Match {matchupIndex + 1} of {matchupCount}
            </p>
          )}
        </div>
      </div>

      {/* Arena: two cards with VS in between */}
      <div className="flex-1 flex items-center gap-0 px-6 pb-4 min-h-0">
        {/* Left fighter */}
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <HeadsUpFighterCard
            recipe={leftRecipe}
            position="left"
            isSelected={selectedId === matchup.id1}
            isConfirmed={isConfirming && selectedId === matchup.id1}
            onClick={() => onSelect(matchup.id1)}
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
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <HeadsUpFighterCard
            recipe={rightRecipe}
            position="right"
            isSelected={selectedId === matchup.id2}
            isConfirmed={isConfirming && selectedId === matchup.id2}
            onClick={() => onSelect(matchup.id2)}
          />
        </div>
      </div>

      {/* Footer: original prompt */}
      <div className="flex items-center justify-center px-6 py-2 shrink-0">
        <p className="text-xs text-gray-500 italic">
          &ldquo;{prompt}&rdquo;
        </p>
      </div>

      {/* Confirming overlay */}
      {isConfirming && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/70 z-10">
          <div className="flex flex-col items-center gap-3">
            <span className="text-sm font-bold uppercase tracking-wider text-orange-400">
              Next matchup&hellip;
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
