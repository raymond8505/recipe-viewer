"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { RecipeRow } from "@/types/recipe";
import type { NormalizedNutrition } from "@/lib/ScalableRecipe";
import { CookButton } from "@/components/buttons";

// Cook mode is a heavy, secondary feature (CookingMode pulls in timers, meal
// logic, and editors). It only renders after the user taps "Cook", so load its
// chunk on demand instead of bundling it into every recipe page. Client-only —
// the modal has no SSR value.
const CookingMode = dynamic(() => import("./CookingMode"), { ssr: false });

interface CookingModeButtonProps {
  recipe: RecipeRow;
  isLoggedIn?: boolean;
  // Primary recipe's normalized ingredient nutrition, threaded through to the
  // cook-mode nutrition panel (primary recipe only).
  normalizedNutrition?: NormalizedNutrition | null;
}

export default function CookingModeButton({
  recipe,
  isLoggedIn = false,
  normalizedNutrition,
}: CookingModeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <CookButton onClick={() => setIsOpen(true)} />
      {isOpen && (
        <CookingMode
          recipe={recipe}
          isLoggedIn={isLoggedIn}
          normalizedNutrition={normalizedNutrition}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
