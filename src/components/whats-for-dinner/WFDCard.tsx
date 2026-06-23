"use client";

import Image from "next/image";
import { useState } from "react";
import type { RecipeRow } from "@/types/recipe";
import { getFirstImage } from "@/lib/format";

interface WFDCardProps {
  recipe: RecipeRow;
  onClick: () => void;
  disabled?: boolean;
}

export default function WFDCard({ recipe, onClick, disabled = false }: WFDCardProps) {
  const { metadata: { schema } } = recipe;
  const image = getFirstImage(schema.image);
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseUp={(e) => { if (e.button === 0 && !disabled) onClick(); }}
      onKeyUp={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled) onClick(); }}
      className="
        relative w-full h-full text-left
        focus:outline-hidden focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-gray-900
        disabled:cursor-not-allowed
        group
      "
      aria-label={`Choose ${schema.name}`}
    >
      <div className="
        relative w-full h-full
        rounded-xl overflow-hidden
        border border-gray-700
        bg-gray-800
        group-hover:border-sky-500/60
        transition-colors duration-150
      ">
        {/* Image */}
        <div className="relative w-full aspect-4/3">
          {image && !imgError ? (
            <Image
              src={image}
              alt={schema.name}
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              className="object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Name + description */}
        <div className="p-3 space-y-1">
          <h3 className="text-base font-semibold text-gray-100 leading-tight line-clamp-2">
            {schema.name}
          </h3>
          {schema.description && (
            <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
              {schema.description}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
