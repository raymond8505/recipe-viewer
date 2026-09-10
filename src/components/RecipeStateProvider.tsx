"use client";

import { useEffect } from "react";
import { notifyRecipeUpdate } from "@/lib/windowApi";
import type { SchemaOrgRecipe } from "@/types/recipe";

interface RecipeStateProviderProps {
  /** The page's recipes in their outbound Schema.org form — the window API is an external edge. */
  recipes: SchemaOrgRecipe[];
}

export default function RecipeStateProvider({ recipes }: RecipeStateProviderProps) {
  useEffect(() => {
    notifyRecipeUpdate(recipes);
  }, [recipes]);

  return null;
}
