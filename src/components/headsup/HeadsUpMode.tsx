"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useHeadsUp } from "@/hooks/useHeadsUp";
import { useOrientationLock } from "@/hooks/useOrientationLock";
import { getFirstImage, formatDuration, toArray } from "@/lib/format";
import type { RecipeRow } from "@/types/recipe";
import HeadsUpPrompt from "./HeadsUpPrompt";
import HeadsUpArena from "./HeadsUpArena";
import HeadsUpVsSplash from "./HeadsUpVsSplash";
import HeadsUpWinner from "./HeadsUpWinner";
import HeadsUpPortraitGuard from "./HeadsUpPortraitGuard";

export default function HeadsUpMode() {
  const { state, startSearch, select, splashDone, reset } = useHeadsUp();
  const { isPortrait } = useOrientationLock();

  const { phase } = state;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 text-white headsup-container flex flex-col">
      {/* Close / back button */}
      <div className="absolute top-3 right-4 z-20">
        <Link
          href="/"
          className="
            flex items-center justify-center w-11 h-11
            rounded-full bg-gray-800/80 border border-gray-700
            text-gray-400 hover:text-white hover:bg-gray-700
            transition-colors
          "
          aria-label="Exit Heads Up mode"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </Link>
      </div>

      {/* Phase-based content */}
      {(phase === "prompt" || phase === "searching") && (
        <HeadsUpPrompt
          onSubmit={startSearch}
          isLoading={phase === "searching"}
          error={null}
        />
      )}

      {phase === "few_results" && (
        <FewResultsGrid
          pool={state.pool}
          prompt={state.prompt}
          onSelect={select}
        />
      )}

      {(phase === "presenting" || phase === "confirming") &&
        state.matchups[state.currentMatchupIndex] && (
          <HeadsUpArena
            matchup={state.matchups[state.currentMatchupIndex]}
            roundNumber={state.roundNumber}
            matchupIndex={state.currentMatchupIndex}
            matchupCount={state.matchups.length}
            pool={state.pool}
            selectedId={state.selectedId}
            isConfirming={phase === "confirming"}
            onSelect={select}
          />
        )}

      {phase === "splash" && (
        <HeadsUpVsSplash
          roundNumber={state.roundNumber}
          onComplete={splashDone}
        />
      )}

      {phase === "winner" && state.winner && (
        <HeadsUpWinner
          recipe={state.winner}
          onPlayAgain={reset}
        />
      )}

      {phase === "error" && (
        <div className="flex flex-col items-center justify-center h-full px-8 text-center">
          <div className="max-w-md space-y-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-900/30 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-red-400">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
            </div>
            <p className="text-red-300 text-sm">
              {state.error}
            </p>
            <button
              type="button"
              onClick={reset}
              className="
                px-6 py-3 min-h-[48px]
                font-bold uppercase tracking-wider text-sm
                bg-gray-800 text-gray-200 rounded-2xl border border-gray-700
                hover:bg-gray-700 active:bg-gray-600
                transition-colors
              "
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Portrait orientation guard */}
      {isPortrait && <HeadsUpPortraitGuard />}
    </div>
  );
}

// ── Few-results grid (< 4 results) ──────────────────────────────────

function FewResultsGrid({
  pool,
  prompt,
  onSelect,
}: {
  pool: RecipeRow[];
  prompt: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500 mb-2">
        Pick your dinner
      </p>
      <p className="text-sm text-gray-400 italic mb-8">
        &ldquo;{prompt}&rdquo;
      </p>

      <div className="flex items-stretch justify-center gap-4 w-full max-w-3xl">
        {pool.map((recipe) => (
          <FewResultsCard
            key={recipe.id}
            recipe={recipe}
            onSelect={() => onSelect(recipe.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FewResultsCard({
  recipe,
  onSelect,
}: {
  recipe: RecipeRow;
  onSelect: () => void;
}) {
  const { metadata: { schema } } = recipe;
  const image = getFirstImage(schema.image);
  const totalTime = formatDuration(schema.totalTime ?? schema.cookTime);
  const categories = toArray(schema.recipeCategory);
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="
        flex-1 max-w-[240px] flex flex-col rounded-2xl overflow-hidden
        bg-gray-800 border-2 border-gray-700
        hover:border-orange-500 active:border-orange-400
        transition-colors text-left
        focus:outline-none focus:ring-2 focus:ring-orange-400
        focus:ring-offset-2 focus:ring-offset-gray-900
      "
    >
      <div className="relative w-full aspect-square">
        {image && !imgError ? (
          <Image
            src={image}
            alt={schema.name}
            fill
            sizes="240px"
            className="object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-gray-700 flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-gray-900/90 to-transparent" />
        <h3 className="absolute bottom-3 left-3 right-3 text-base font-bold text-white leading-snug line-clamp-2 drop-shadow-lg">
          {schema.name}
        </h3>
      </div>

      <div className="p-3 space-y-1.5">
        {schema.description && (
          <p className="text-xs text-gray-300 line-clamp-2">{schema.description}</p>
        )}
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          {totalTime && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {totalTime}
            </span>
          )}
          {categories[0] && (
            <span className="px-1.5 py-0.5 bg-orange-900/50 text-orange-400 rounded-full font-medium">
              {categories[0]}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
