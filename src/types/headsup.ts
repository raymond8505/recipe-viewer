import type { FlatRecipeRow, RecipeRow } from "./recipe";

// ── Bracket building blocks ──────────────────────────────────────────

export interface Matchup {
  id1: string;
  id2: string;
}

// ── /api/headsup/search ───────────────────────────────────────────────

export interface HeadsUpSearchRequest {
  prompt: string;
}

export interface HeadsUpSearchWebhookResponse {
  recipes: FlatRecipeRow[];
}

export interface HeadsUpSearchResponse {
  recipes: RecipeRow[];
}
