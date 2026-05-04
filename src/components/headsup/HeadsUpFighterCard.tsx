"use client";

import Image from "next/image";
import { useState } from "react";
import type { RecipeRow } from "@/types/recipe";
import { getFirstImage, extractRecipeStats } from "@/lib/format";
import { StatIcon } from "@/components/icons";

interface HeadsUpFighterCardProps {
  recipe: RecipeRow;
  position: "left" | "right";
  isSelected: boolean;
  isConfirmed: boolean;
  onClick: () => void;
}

export default function HeadsUpFighterCard({
  recipe,
  position,
  isSelected,
  isConfirmed,
  onClick,
}: HeadsUpFighterCardProps) {
  const { metadata: { schema } } = recipe;
  const image = getFirstImage(schema.image);
  const stats = extractRecipeStats(schema);
  const [imgError, setImgError] = useState(false);

  const slideClass = position === "left" ? "animate-slide-left" : "animate-slide-right";

  return (
    <button
      type="button"
      onMouseUp={(e) => { if (e.button === 0) onClick(); }}
      onKeyUp={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className={`
        relative w-full max-w-sm text-left
        transition-transform duration-200
        ${isSelected ? "scale-[1.02]" : ""}
        focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-gray-900
        ${slideClass}
      `}
    >
      <div className={`card-frame ${isSelected ? "animate-selection-glow" : ""}`}>
        <div className="card-inner">
          {/* Inset image */}
          <div className="image-frame">
            <div className="relative w-full aspect-[4/3]">
              {image && !imgError ? (
                <Image
                  src={image}
                  alt={schema.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
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
            <h3 className="text-base font-semibold text-gray-100 leading-tight line-clamp-1">
              {schema.name}
            </h3>
          </div>

          {/* Flavor text */}
          {schema.description && (
            <p className="text-xs text-gray-500 italic text-center px-2 py-1.5 line-clamp-2 leading-relaxed flex-shrink min-h-0">
              {schema.description}
            </p>
          )}

          {/* Stats grid */}
          {stats.length > 0 && (
            <div className="stats-grid mt-auto">
              {stats.map((stat) => (
                <div key={stat.label} className="stat-cell">
                  <StatIcon icon={stat.icon} />
                  <span className="text-[11px] font-medium text-gray-200 leading-none truncate max-w-full px-1">
                    {stat.value}
                  </span>
                  <span className="text-[9px] text-gray-600 uppercase tracking-wide leading-none">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmed overlay */}
      {isConfirmed && (
        <div className="absolute inset-0 flex items-center justify-center bg-amber-500/20 animate-confirm-flash rounded-xl">
          <span className="text-3xl font-black text-amber-400 uppercase tracking-wider drop-shadow-lg">
            Chosen!
          </span>
        </div>
      )}
    </button>
  );
}
