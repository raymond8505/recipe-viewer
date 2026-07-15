// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "@/lib/retry";

// Backoff is driven with fake timers so no test actually waits. mockFetch
// stands in for global fetch, matching the client test setup.
const mockFetch = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const URL_ = "https://example.test/api";

function res(
  status: number,
  body = "",
  headers?: Record<string, string>,
): Response {
  return new Response(body, { status, headers });
}

// Attach settle handlers immediately (no unhandled-rejection warning while the
// fake clock advances), run every pending timer, then re-surface the outcome.
async function settle<T>(p: Promise<T>): Promise<T> {
  const guarded = p.then(
    (v) => ({ ok: true as const, v }),
    (e) => ({ ok: false as const, e }),
  );
  await vi.advanceTimersByTimeAsync(60_000);
  const r = await guarded;
  if (r.ok) return r.v;
  throw r.e;
}

describe("fetchWithRetry", () => {
  it("returns the first success without any retry", async () => {
    mockFetch.mockResolvedValueOnce(res(200, "ok"));

    const result = await settle(fetchWithRetry(URL_));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
  });

  it("retries a retryable status then returns the recovered response", async () => {
    mockFetch
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(200, "ok"));

    const result = await settle(fetchWithRetry(URL_));

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  it("retries a thrown network error then succeeds", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(res(200, "ok"));

    const result = await settle(fetchWithRetry(URL_));

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  it("returns the last error response after exhausting retries (no throw)", async () => {
    mockFetch.mockResolvedValue(res(500));

    const result = await settle(fetchWithRetry(URL_));

    // retries defaults to 2 → 3 total attempts.
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.status).toBe(500);
  });

  it("rethrows the last error when every attempt throws", async () => {
    const err = new TypeError("still down");
    mockFetch.mockRejectedValue(err);

    await expect(settle(fetchWithRetry(URL_))).rejects.toBe(err);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 403, 404])(
    "returns a non-retryable %i immediately",
    async (status) => {
      mockFetch.mockResolvedValue(res(status));

      const result = await settle(fetchWithRetry(URL_));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(status);
    },
  );

  it("aborts a hung attempt via the per-attempt timeout and retries it", async () => {
    // A fetch that never resolves on its own — only the timeout's abort ends it.
    mockFetch.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );

    await expect(
      settle(fetchWithRetry(URL_, undefined, { timeoutMs: 1_000 })),
    ).rejects.toBeInstanceOf(DOMException);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Every attempt is handed an abort signal.
    for (const call of mockFetch.mock.calls) {
      expect((call[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("honors a numeric Retry-After before retrying a 429", async () => {
    mockFetch
      .mockResolvedValueOnce(res(429, "", { "retry-after": "2" }))
      .mockResolvedValueOnce(res(200, "ok"));

    const p = fetchWithRetry(URL_, undefined, { maxDelayMs: 10_000 });
    const status = p.then((r) => r.status);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(mockFetch).toHaveBeenCalledTimes(1); // still waiting out the 2s

    await vi.advanceTimersByTimeAsync(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(await status).toBe(200);
  });

  it("caps a large Retry-After at maxDelayMs", async () => {
    mockFetch
      .mockResolvedValueOnce(res(503, "", { "retry-after": "3600" }))
      .mockResolvedValueOnce(res(200, "ok"));

    const p = fetchWithRetry(URL_, undefined, { maxDelayMs: 5_000 });
    const status = p.then((r) => r.status);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2); // crosses the 5s cap, not the 3600s header
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(await status).toBe(200);
  });

  it("applies capped exponential backoff between attempts", async () => {
    // Full-jitter = Math.random() * backoff; pin random high so delay == backoff.
    vi.spyOn(Math, "random").mockReturnValue(1);
    mockFetch.mockResolvedValue(res(500));

    const p = fetchWithRetry(URL_, undefined, {
      retries: 2,
      baseDelayMs: 1_000,
      factor: 2,
      maxDelayMs: 1_500,
      timeoutMs: 60_000, // keep the timeout out of the way
    });
    const status = p.then((r) => r.status);

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // attempt 0 delay = 1000 * 2**0 = 1000
    await vi.advanceTimersByTimeAsync(999);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // attempt 1 delay = min(1500, 1000 * 2**1 = 2000) = 1500 (capped)
    await vi.advanceTimersByTimeAsync(1_499);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    expect(await status).toBe(500);
  });
});
