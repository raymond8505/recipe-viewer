"use client";

import Link from "next/link";
import { useWFD } from "@/hooks/useWFD";
import WFDPrompt from "./WFDPrompt";
import WFDArena from "./WFDArena";

export default function WFDMode() {
  const { state, startSearch, pick, reset } = useWFD();
  const { phase } = state;

  const showArena =
    state.contenders.length >= 2 &&
    (phase === "presenting" || phase === "loading");

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 text-white wfd-container flex flex-col">
      {/* Close button */}
      <div className="absolute top-3 right-4 z-20">
        <Link
          href="/"
          className="
            flex items-center justify-center w-11 h-11
            rounded-full bg-gray-800/80 border border-gray-700
            text-gray-400 hover:text-white hover:bg-gray-700
            transition-colors
          "
          aria-label="Exit What's for Dinner"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </Link>
      </div>

      {/* Prompt / initial loading */}
      {!showArena && phase !== "error" && (
        <WFDPrompt
          onSubmit={startSearch}
          isLoading={phase === "loading"}
          error={state.error}
        />
      )}

      {/* Arena */}
      {showArena && (
        <div className="flex flex-col h-full pt-14">
          <div className="flex items-center justify-between px-4 py-2 shrink-0">
            <p className="text-xs text-gray-500 italic truncate max-w-[70%]">
              &ldquo;{state.prompt}&rdquo;
            </p>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors ml-2 shrink-0"
            >
              Start over
            </button>
          </div>

          <WFDArena
            contenders={state.contenders}
            losingIndices={state.losingIndices}
            phase={phase}
            onPick={pick}
          />
        </div>
      )}

      {/* Error state */}
      {phase === "error" && (
        <div className="flex flex-col items-center justify-center h-full gap-6 px-8 text-center">
          <p className="text-red-400 text-sm max-w-sm">{state.error}</p>
          <button
            type="button"
            onClick={reset}
            className="px-6 py-3 bg-gray-800 border border-gray-700 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
