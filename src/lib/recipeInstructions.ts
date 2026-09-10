import type { RecipeInstructionGroup, RecipeStep } from "@/types/recipe";

// Pure helpers over a recipe's instruction groups. Client-safe on purpose: the
// editor, cooking mode and the window API need them, and none of them may
// reach @/env (the Supabase clients do). Nothing here imports ./format — that
// module imports this one.

/** The groups' steps in reading order: group by group, step by step. */
export function flattenSteps(
  groups: readonly RecipeInstructionGroup[],
): RecipeStep[] {
  return groups.flatMap((group) => group.steps);
}

/** The timers a recipe declares: every step carrying both a label and a duration, in reading order. */
export function stepTimers(
  groups: readonly RecipeInstructionGroup[],
): Array<{ name: string; seconds: number }> {
  return flattenSteps(groups).flatMap((step) =>
    step.name && step.seconds ? [{ name: step.name, seconds: step.seconds }] : [],
  );
}

/**
 * The one canonical form of an instruction list, applied at every write so the
 * stored column never depends on who wrote it: text and names trimmed; blank
 * steps, blank names and empty groups dropped; `seconds` kept only as a
 * positive whole number beside a name; adjacent nameless groups merged. That
 * last rule is what makes the Schema.org round trip lossless — two nameless
 * runs in a row have no HowTo spelling that keeps them apart.
 *
 * Never mutates its input.
 */
export function canonicalizeInstructions(
  groups: readonly RecipeInstructionGroup[],
): RecipeInstructionGroup[] {
  const result: RecipeInstructionGroup[] = [];
  for (const group of groups) {
    const steps = group.steps.flatMap(canonicalizeStep);
    if (steps.length === 0) continue;
    const name = group.name?.trim() || undefined;
    const last = result[result.length - 1];
    if (name === undefined && last !== undefined && last.name === undefined) {
      last.steps.push(...steps);
    } else {
      result.push(name !== undefined ? { name, steps } : { steps });
    }
  }
  return result;
}

function canonicalizeStep(step: RecipeStep): RecipeStep[] {
  const text = step.text.trim();
  if (!text) return [];
  const name = step.name?.trim() || undefined;
  const seconds =
    name !== undefined && Number.isInteger(step.seconds) && (step.seconds as number) >= 1
      ? step.seconds
      : undefined;
  return [
    {
      text,
      ...(name !== undefined ? { name } : {}),
      ...(seconds !== undefined ? { seconds } : {}),
    },
  ];
}
