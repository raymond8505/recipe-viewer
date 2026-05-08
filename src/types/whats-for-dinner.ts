import type { FlatRecipeRow, RecipeRow } from "./recipe";

export interface WFDWebhookRequest {
  prompt: string;
  choices: FlatRecipeRow[];
}

export interface WFDWebhookResponse {
  recipes: FlatRecipeRow[];
}

export type WFDPhase = "prompt" | "loading" | "presenting" | "error";

export interface WFDState {
  phase: WFDPhase;
  prompt: string;
  /** Full ordered array of current contenders — index maps to card position. */
  contenders: RecipeRow[];
  /**
   * Which positions are animating out during loading.
   * Set at PICK time (all indices except the winner's).
   * Cleared when the response arrives.
   */
  losingIndices: number[];
  /**
   * Index of the winner in contenders[], set during PICK.
   * Used by CONTENDERS_LOADED to place the winner back at its original slot
   * while filling other slots from the response.
   * Null before any pick (initial load) and after merge completes.
   */
  winnerIndex: number | null;
  /** Full recipe objects for every winner chosen so far, in pick order. */
  choices: RecipeRow[];
  error: string | null;
}
