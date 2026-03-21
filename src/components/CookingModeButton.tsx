"use client";

import { useState } from "react";
import type { RecipeRow } from "@/types/recipe";
import CookingMode from "./CookingMode";

interface CookingModeButtonProps {
  recipe: RecipeRow;
}

export default function CookingModeButton({ recipe }: CookingModeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-full transition-colors"
      >
        <ChefHatIcon />
        Cook
      </button>
      {isOpen && (
        <CookingMode recipe={recipe} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}

function ChefHatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
      <line x1="6" x2="18" y1="17" y2="17" />
    </svg>
  );
}
