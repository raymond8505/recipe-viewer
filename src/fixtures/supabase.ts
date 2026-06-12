import { vi } from "vitest";

export interface MakeSupabaseClientOptions {
  recipe?: object | null;
  fetchError?: object | null;
  updateError?: object | null;
}

// Shared mock for the Supabase client chains the API route tests exercise:
// from(...).select(...).eq(...).single() and from(...).update(...).eq(...).
// Routes that never call update simply ignore that branch. `from` returns a
// fresh object per call so tests can assert via from.mock.results[n].
//
// NOT exported from the @/fixtures barrel: this module imports vitest, and
// stories import the barrel — vitest must never reach the Storybook bundle.
// Import directly from "@/fixtures/supabase" in test files.
export function makeSupabaseClient({
  recipe = { id: "recipe-1" },
  fetchError = null,
  updateError = null,
}: MakeSupabaseClientOptions = {}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi
            .fn()
            .mockResolvedValue({ data: recipe, error: fetchError }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: updateError }),
      })),
    })),
  };
}
