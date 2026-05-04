"use client";

import { useState } from "react";
import type { RecipeRow } from "@/types/recipe";
import CookingMode from "./CookingMode";
import { ChefHatIcon } from "@/components/icons";

interface CookingModeButtonProps {
  recipe: RecipeRow;
  isLoggedIn?: boolean;
}

export default function CookingModeButton({ recipe, isLoggedIn = false }: CookingModeButtonProps) {
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
        <CookingMode recipe={recipe} isLoggedIn={isLoggedIn} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
