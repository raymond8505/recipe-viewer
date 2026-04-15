"use client";

import Link from "next/link";
import { useHeadsUp } from "@/hooks/useHeadsUp";
import { useOrientationLock } from "@/hooks/useOrientationLock";
import HeadsUpPrompt from "./HeadsUpPrompt";
import HeadsUpArena from "./HeadsUpArena";
import HeadsUpVsSplash from "./HeadsUpVsSplash";
import HeadsUpWinner from "./HeadsUpWinner";
import HeadsUpPortraitGuard from "./HeadsUpPortraitGuard";

export default function HeadsUpMode() {
  const { state, startSearch, select, deselect, splashDone, reset } = useHeadsUp();
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

      {(phase === "presenting" || phase === "selected" || phase === "confirming" || phase === "deciding") && state.currentRound && (
        <HeadsUpArena
          round={state.currentRound}
          roundNumber={state.roundNumber}
          pool={state.pool}
          selectedId={state.selectedId}
          isConfirming={phase === "confirming"}
          isDeciding={phase === "deciding"}
          prompt={state.prompt}
          onSelect={select}
        />
      )}

      {phase === "splash" && state.currentRound && (
        <HeadsUpVsSplash
          roundNumber={state.roundNumber + 1}
          round={state.currentRound}
          pool={state.pool}
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
