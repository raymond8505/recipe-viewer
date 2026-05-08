import type { FlatRecipeRow, RecipeRow } from "@/types/recipe";

export async function fetchWFDContenders(
  prompt: string,
  choices: FlatRecipeRow[],
  signal: AbortSignal,
): Promise<{ recipes: RecipeRow[]; error?: string }> {
  const res = await fetch("/api/whats-for-dinner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, choices }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { recipes: [], error: body.error ?? `Request failed (${res.status})` };
  }

  const data = await res.json();
  if (!Array.isArray(data.recipes) || data.recipes.length < 2) {
    return { recipes: [], error: "Not enough recipes returned." };
  }

  return { recipes: data.recipes as RecipeRow[] };
}
