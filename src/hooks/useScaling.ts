import { useState } from "react";
import { parseServings } from "@/lib/units";

export function useScaling(recipeYield: string | string[] | undefined | null) {
  const originalServings = parseServings(recipeYield);
  const [scale, setScale] = useState(1);

  const servings =
    originalServings != null ? Math.max(1, Math.round(originalServings * scale)) : null;

  function setServings(n: number) {
    if (!originalServings || n <= 0) return;
    setScale(n / originalServings);
  }

  return { scale, servings, originalServings, setScale, setServings };
}
