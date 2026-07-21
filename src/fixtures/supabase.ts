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

export interface SupabaseQueueResponse {
  data?: unknown;
  error?: { message?: string; code?: string } | null;
  count?: number | null;
}

// Queue-based mock for repo tests whose query chains vary per call
// (select/insert/update/delete/rpc with order/range/ilike modifiers — richer
// than makeSupabaseClient covers). Every chain method returns the same builder;
// awaiting the builder (Supabase builders are thenables) or calling .single()
// resolves the NEXT queued response. Assert on chain calls via
// client.from.mock.results[n].value.<method>.
export function makeSupabaseQueue(responses: SupabaseQueueResponse[]) {
  let i = 0;
  const next = (): SupabaseQueueResponse =>
    responses[i++] ?? { data: null, error: null };

  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    for (const method of [
      "select",
      "insert",
      "update",
      "delete",
      "eq",
      "in",
      "or",
      "ilike",
      "order",
      "range",
      "limit",
    ]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.single = vi.fn(() => Promise.resolve(next()));
    builder.then = (
      onFulfilled: (value: SupabaseQueueResponse) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(next()).then(onFulfilled, onRejected);
    return builder;
  };

  return {
    from: vi.fn(() => makeBuilder()),
    rpc: vi.fn(() => Promise.resolve(next())),
  };
}
