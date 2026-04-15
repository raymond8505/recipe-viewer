"use client";

import { useEffect } from "react";
import type { RecipeRow } from "@/types/recipe";
import type { Matchup } from "@/types/headsup";

interface HeadsUpVsSplashProps {
  roundNumber: number;
  firstMatchup: Matchup;
  pool: RecipeRow[];
  onComplete: () => void;
}

export default function HeadsUpVsSplash({
  roundNumber,
  firstMatchup,
  pool,
  onComplete,
}: HeadsUpVsSplashProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const leftName =
    pool.find((r) => r.id === firstMatchup.id1)?.metadata.schema.name ??
    "???";
  const rightName =
    pool.find((r) => r.id === firstMatchup.id2)?.metadata.schema.name ??
    "???";

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col items-center justify-center">
      {/* Round number */}
      <p className="text-sm font-bold uppercase tracking-[0.3em] text-gray-400 mb-4 animate-fade-in">
        Round {roundNumber}
      </p>

      {/* VS text */}
      <span className="text-7xl font-black text-orange-500 drop-shadow-[0_0_30px_rgba(249,115,22,0.6)] animate-vs-entrance select-none">
        VS
      </span>

      {/* Fighter names */}
      <div className="flex items-center justify-center gap-8 mt-8 w-full max-w-2xl px-8">
        <p className="flex-1 text-right text-lg font-semibold text-gray-300 animate-slide-left truncate">
          {leftName}
        </p>
        <div className="w-px h-6 bg-gray-700 shrink-0" />
        <p className="flex-1 text-left text-lg font-semibold text-gray-300 animate-slide-right truncate">
          {rightName}
        </p>
      </div>
    </div>
  );
}
