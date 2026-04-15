"use client";

import Image from "next/image";
import { useState } from "react";
import type { RecipeRow } from "@/types/recipe";
import { formatDuration, getFirstImage, toArray } from "@/lib/format";

interface HeadsUpFighterCardProps {
  recipe: RecipeRow;
  optionLabel: string;
  position: "left" | "right";
  isSelected: boolean;
  isConfirmed: boolean;
  onClick: () => void;
}

export default function HeadsUpFighterCard({
  recipe,
  optionLabel,
  position,
  isSelected,
  isConfirmed,
  onClick,
}: HeadsUpFighterCardProps) {
  const { metadata: { schema } } = recipe;
  const image = getFirstImage(schema.image);
  const totalTime = formatDuration(schema.totalTime ?? schema.cookTime);
  const categories = toArray(schema.recipeCategory);
  const [imgError, setImgError] = useState(false);

  const slideClass = position === "left" ? "animate-slide-left" : "animate-slide-right";

  const borderClass = isSelected
    ? "border-orange-500 animate-selection-glow"
    : "border-gray-700 hover:border-gray-500";

  const scaleClass = isSelected ? "scale-[1.02]" : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        relative flex flex-col rounded-2xl overflow-hidden
        bg-gray-800 border-2 ${borderClass}
        transition-all duration-200 ${scaleClass}
        w-full h-full min-h-[200px] text-left
        focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:ring-offset-gray-900
        ${slideClass}
      `}
    >
      {/* Recipe image with gradient overlay */}
      <div className="relative w-full flex-1 min-h-0">
        {image && !imgError ? (
          <Image
            src={image}
            alt={schema.name}
            fill
            sizes="45vw"
            className="object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-gray-700 flex items-center justify-center">
            <svg className="w-16 h-16 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Dark gradient at bottom of image */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-gray-900/90 to-transparent" />

        {/* Recipe name overlaid on gradient */}
        <h3 className="absolute bottom-3 left-4 right-4 text-xl font-bold text-white leading-snug line-clamp-2 drop-shadow-lg">
          {schema.name}
        </h3>
      </div>

      {/* Card body */}
      <div className="p-4 space-y-2">
        {/* Webhook-provided option label */}
        <p className="text-sm text-orange-400 font-medium italic line-clamp-1">
          {optionLabel}
        </p>

        {schema.description && (
          <p className="text-sm text-gray-400 line-clamp-2">
            {schema.description}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-gray-500 pt-1">
          {totalTime && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
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

      {/* Confirmed overlay */}
      {isConfirmed && (
        <div className="absolute inset-0 flex items-center justify-center bg-orange-500/20 animate-confirm-flash rounded-2xl">
          <span className="text-3xl font-black text-orange-400 uppercase tracking-wider drop-shadow-lg">
            Chosen!
          </span>
        </div>
      )}
    </button>
  );
}
