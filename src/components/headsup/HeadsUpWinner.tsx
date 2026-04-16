"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { RecipeRow } from "@/types/recipe";
import { getFirstImage, extractRecipeStats } from "@/lib/format";
import { StatIcon } from "./HeadsUpFighterCard";

interface HeadsUpWinnerProps {
  recipe: RecipeRow;
  onPlayAgain: () => void;
}

export default function HeadsUpWinner({ recipe, onPlayAgain }: HeadsUpWinnerProps) {
  const { metadata: { schema } } = recipe;
  const image = getFirstImage(schema.image);
  const stats = extractRecipeStats(schema);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-6 overflow-y-auto">
      {/* Winner title */}
      <h1 className="text-4xl font-black uppercase tracking-wider text-amber-300/80 mb-6 animate-winner-bounce">
        Winner!
      </h1>

      {/* Winner card — tapping opens the recipe page */}
      <Link
        href={`/recipes/${recipe.id}`}
        className="block w-full max-w-md"
      >
        <div className="card-frame card-frame-winner animate-selection-glow">
          <div className="card-inner">
            {/* Inset image */}
            <div className="image-frame">
              <div className="relative w-full aspect-[4/3]">
                {image && !imgError ? (
                  <Image
                    src={image}
                    alt={schema.name}
                    fill
                    sizes="448px"
                    className="object-cover"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-700/50 flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <h2 className="text-xl font-semibold text-gray-100 leading-tight">
                {schema.name}
              </h2>
            </div>

            {/* Flavor text */}
            {schema.description && (
              <p className="text-sm text-gray-500 italic text-center px-3 py-1.5 line-clamp-2 leading-relaxed">
                {schema.description}
              </p>
            )}

            {/* Stats grid */}
            {stats.length > 0 && (
              <div className="stats-grid mt-auto">
                {stats.map((stat) => (
                  <div key={stat.label} className="stat-cell">
                    <StatIcon icon={stat.icon} />
                    <span className="text-xs font-medium text-gray-200 leading-none truncate max-w-full px-1">
                      {stat.value}
                    </span>
                    <span className="text-[10px] text-gray-600 uppercase tracking-wide leading-none">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Link>

      {/* Play again button */}
      <div className="flex items-center gap-4 mt-6">
        <button
          type="button"
          onClick={onPlayAgain}
          className="
            px-6 py-3 min-h-[48px]
            font-bold uppercase tracking-wider text-sm
            bg-gray-800 text-gray-200 rounded-2xl border border-amber-900/50
            hover:bg-gray-700 active:bg-gray-600
            transition-colors
          "
        >
          Play Again
        </button>
      </div>
    </div>
  );
}
