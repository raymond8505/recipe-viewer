import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/env", () => ({ env: { GEMINI_API_KEY: "test-key" } }));

import { generateEmbedding } from "@/lib/embedding";

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("generateEmbedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the documented request shape with the API key header", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ embedding: { values: [1, 0] } }));
    vi.stubGlobal("fetch", fetchSpy);

    await generateEmbedding("a markdown recipe");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
    );
    expect(init.method).toBe("POST");
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body)).toEqual({
      content: { parts: [{ text: "a markdown recipe" }] },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 768,
    });
  });

  it("returns the raw vector unchanged (no normalization)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ embedding: { values: [3, 4] } })));

    const result = await generateEmbedding("text");

    expect(result).toEqual([3, 4]);
  });

  it("returns null on a non-retryable non-200 (400)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 400 })));

    expect(await generateEmbedding("text")).toBeNull();
  });

  it("returns null when the response body has no embedding values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ embedding: {} })));

    expect(await generateEmbedding("text")).toBeNull();
  });

  it("returns null on an empty values array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ embedding: { values: [] } })));

    expect(await generateEmbedding("text")).toBeNull();
  });

  // Transient failures now go through fetchWithRetry. Fake timers drive the
  // backoff so these don't actually wait.
  describe("retry behavior", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("retries then returns null when the API keeps returning 429", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(new Response("nope", { status: 429 }));
      vi.stubGlobal("fetch", fetchSpy);

      const p = generateEmbedding("text");
      await vi.advanceTimersByTimeAsync(60_000);

      expect(await p).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(3); // 1 attempt + 2 retries
    });

    it("retries then returns null (never throws) on a persistent network error", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
      vi.stubGlobal("fetch", fetchSpy);

      const p = generateEmbedding("text");
      await vi.advanceTimersByTimeAsync(60_000);

      expect(await p).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("recovers when a transient 503 is followed by success", async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
        .mockResolvedValueOnce(jsonResponse({ embedding: { values: [3, 4] } }));
      vi.stubGlobal("fetch", fetchSpy);

      const p = generateEmbedding("text");
      await vi.advanceTimersByTimeAsync(60_000);

      expect(await p).toEqual([3, 4]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
