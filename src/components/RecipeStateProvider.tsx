"use client";

import { useEffect } from "react";
import { notifyRecipeUpdate } from "@/lib/windowApi";
import type { SchemaRecipe } from "@/types/recipe";

interface RecipeStateProviderProps {
  schemas: SchemaRecipe[];
}

export default function RecipeStateProvider({ schemas }: RecipeStateProviderProps) {
  useEffect(() => {
    notifyRecipeUpdate(schemas);
  }, [schemas]);

  return null;
}
