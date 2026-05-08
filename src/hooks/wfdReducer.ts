import type { RecipeRow } from "@/types/recipe";
import type { WFDState } from "@/types/whats-for-dinner";

export type WFDAction =
  | { type: "START_SEARCH"; prompt: string }
  | { type: "CONTENDERS_LOADED"; recipes: RecipeRow[] }
  | { type: "PICK"; index: number }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

export const INITIAL_STATE: WFDState = {
  phase: "prompt",
  prompt: "",
  contenders: [],
  losingIndices: [],
  winnerIndex: null,
  choices: [],
  error: null,
};

export function reducer(state: WFDState, action: WFDAction): WFDState {
  switch (action.type) {
    case "START_SEARCH":
      return { ...INITIAL_STATE, phase: "loading", prompt: action.prompt };

    case "CONTENDERS_LOADED": {
      if (state.winnerIndex === null) {
        return {
          ...state,
          phase: "presenting",
          contenders: action.recipes,
          losingIndices: [],
        };
      }

      const winner = state.choices[state.choices.length - 1];
      const winnerIdx = state.winnerIndex;
      const pool = action.recipes.filter((r) => r.id !== winner.id);
      let poolCursor = 0;

      const newContenders = state.contenders.map((_, i) => {
        if (i === winnerIdx) return winner;
        return pool[poolCursor++]!;
      });

      return {
        ...state,
        phase: "presenting",
        contenders: newContenders,
        winnerIndex: null,
        losingIndices: [],
      };
    }

    case "PICK": {
      const winner = state.contenders[action.index];
      if (!winner) return state;
      const losingIndices = state.contenders
        .map((_, i) => i)
        .filter((i) => i !== action.index);
      return {
        ...state,
        phase: "loading",
        winnerIndex: action.index,
        choices: [...state.choices, winner],
        losingIndices,
      };
    }

    case "ERROR":
      return { ...state, phase: "error", error: action.message };

    case "RESET":
      return INITIAL_STATE;

    default:
      return state;
  }
}
