import type { Timer } from "@/hooks/useTimers";

export function makeTimer(
  id: string,
  label: string,
  overrides: Partial<Timer> = {},
): Timer {
  return {
    id,
    label,
    duration: 600,
    remaining: 300,
    paused: false,
    finished: false,
    // Display never reads endsAt — it renders `remaining` — so leaving this null keeps cards and
    // stories deterministic instead of pinning them to Date.now(). Pass one for deadline tests.
    endsAt: null,
    ...overrides,
  };
}
