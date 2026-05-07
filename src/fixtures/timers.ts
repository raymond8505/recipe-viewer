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
    ...overrides,
  };
}
