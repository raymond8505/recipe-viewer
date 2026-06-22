"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { RecipeRow } from "@/types/recipe";
import { ChefHatIcon } from "@/components/icons";

// Cook mode is a heavy, secondary feature (CookingMode pulls in timers, meal
// logic, and editors). It only renders after the user taps "Cook", so load its
// chunk on demand instead of bundling it into every recipe page. Client-only —
// the modal has no SSR value.
const CookingMode = dynamic(() => import("./CookingMode"), { ssr: false });

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
