import type { RecipeInstructionGroup, RecipeStep } from "@/types/recipe";

/** One step; put the timer (`name` + `seconds`) in `overrides`. */
export function makeStep(text: string, overrides?: Partial<RecipeStep>): RecipeStep {
  return { text, ...overrides };
}

/** A group from a mix of bare texts and ready-made steps; `undefined` name = the nameless group. */
export function makeInstructionGroup(
  name: string | undefined,
  steps: Array<string | RecipeStep>,
): RecipeInstructionGroup {
  return {
    ...(name != null ? { name } : {}),
    steps: steps.map((step) => (typeof step === "string" ? makeStep(step) : step)),
  };
}

/** The common case: an unsectioned list, as one nameless group. */
export function makeSteps(texts: Array<string | RecipeStep>): RecipeInstructionGroup[] {
  return [makeInstructionGroup(undefined, texts)];
}
