"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useHeadsUp } from "@/hooks/useHeadsUp";
import { useOrientationLock } from "@/hooks/useOrientationLock";
import { getFirstImage, extractRecipeStats } from "@/lib/format";
import type { RecipeRow } from "@/types/recipe";
import { StatIcon } from "@/components/icons";
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
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400 mb-2">
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
  const stats = extractRecipeStats(schema).slice(0, 4);
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="
        flex-1 max-w-[240px]
        focus:outline-none focus:ring-2 focus:ring-amber-400
        focus:ring-offset-2 focus:ring-offset-gray-900
        transition-transform hover:scale-[1.02]
      "
    >
      <div className="card-frame">
        <div className="card-inner">
          {/* Inset image */}
          <div className="image-frame">
            <div className="relative w-full aspect-[4/3]">
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
                <div className="w-full h-full bg-gray-700/50 flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Nameplate banner */}
          <div className="card-nameplate">
            <h3 className="text-sm font-semibold text-gray-100 leading-tight line-clamp-1">
              {schema.name}
            </h3>
          </div>

          {/* Flavor text */}
          {schema.description && (
            <p className="text-[11px] text-gray-500 italic text-center px-1 py-0.5 line-clamp-1 leading-relaxed">
              {schema.description}
            </p>
          )}

          {/* Stats grid — 2 column for narrow cards */}
          {stats.length > 0 && (
            <div className="stats-grid stats-grid-2col mt-auto">
              {stats.map((stat) => (
                <div key={stat.label} className="stat-cell">
                  <StatIcon icon={stat.icon} />
                  <span className="text-[10px] font-medium text-gray-200 leading-none truncate max-w-full px-1">
                    {stat.value}
                  </span>
                  <span className="text-[8px] text-gray-600 uppercase tracking-wide leading-none">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
