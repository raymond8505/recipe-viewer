"use client";

import Image from "next/image";
import { useState } from "react";
import type { RecipeRow, RecipeStat } from "@/types/recipe";
import { getFirstImage, extractRecipeStats } from "@/lib/format";

interface HeadsUpFighterCardProps {
  recipe: RecipeRow;
  position: "left" | "right";
  isSelected: boolean;
  isConfirmed: boolean;
  onClick: () => void;
}

function StatIcon({ icon }: { icon: RecipeStat["icon"] }) {
  const cls = "w-3 h-3 text-amber-500/50";
  switch (icon) {
    case "clock":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "flame":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
        </svg>
      );
    case "servings":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "ingredients":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      );
    case "globe":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "tag":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      );
  }
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

export { StatIcon };
