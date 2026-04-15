"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { RecipeRow } from "@/types/recipe";
import { getFirstImage, formatDuration, toArray } from "@/lib/format";

interface HeadsUpWinnerProps {
  recipe: RecipeRow;
  onPlayAgain: () => void;
}

export default function HeadsUpWinner({ recipe, onPlayAgain }: HeadsUpWinnerProps) {
  const { metadata: { schema } } = recipe;
  const image = getFirstImage(schema.image);
  const totalTime = formatDuration(schema.totalTime ?? schema.cookTime);
  const categories = toArray(schema.recipeCategory);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-6 overflow-y-auto">
      {/* Winner title */}
      <h1 className="text-4xl font-black uppercase tracking-wider text-orange-500 drop-shadow-[0_0_20px_rgba(249,115,22,0.5)] mb-6 animate-winner-bounce">
        Winner!
      </h1>

      {/* Winner card */}
      <div className="w-full max-w-sm rounded-2xl overflow-hidden bg-gray-800 border-2 border-orange-500 animate-selection-glow">
        {/* Image */}
        {image && !imgError ? (
          <div className="relative w-full aspect-video">
            <Image
              src={image}
              alt={schema.name}
              fill
              sizes="400px"
              className="object-cover"
              onError={() => setImgError(true)}
            />
          </div>
        ) : (
          <div className="w-full aspect-video bg-gray-700 flex items-center justify-center">
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

        {/* Details */}
        <div className="p-4 space-y-2">
          <h2 className="text-xl font-bold text-white">{schema.name}</h2>
          {schema.description && (
            <p className="text-sm text-gray-400 line-clamp-2">{schema.description}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {totalTime && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {totalTime}
              </span>
            )}
            {categories[0] && (
              <span className="px-2 py-0.5 bg-orange-900/50 text-orange-400 rounded-full font-medium">
                {categories[0]}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-4 mt-6">
        <Link
          href={`/recipes/${recipe.id}`}
          className="
            px-6 py-3 min-h-[48px]
            font-bold uppercase tracking-wider text-sm
            bg-orange-500 text-white rounded-2xl
            hover:bg-orange-600 active:bg-orange-700
            transition-colors
            flex items-center justify-center
          "
        >
          View Recipe
        </Link>
        <button
          type="button"
          onClick={onPlayAgain}
          className="
            px-6 py-3 min-h-[48px]
            font-bold uppercase tracking-wider text-sm
            bg-gray-800 text-gray-200 rounded-2xl border border-gray-700
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
