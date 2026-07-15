// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_STRUCTURED_MODEL,
  generateStructured,
} from "@/lib/gemini";

// Module-level createEnv captures runtimeEnv at import time — mock with inline
// literals (factories are hoisted; no module consts).
vi.mock("@/env", () => ({
  env: { GEMINI_API_KEY: "test-gemini-key" },
}));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const SCHEMA = {
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
};

function candidateResponse(text: string, status = 200): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

describe("generateStructured", () => {
  it("sends the schema-constrained generationConfig and parses the JSON text", async () => {
    mockFetch.mockResolvedValueOnce(candidateResponse('{"name":"cumin"}'));

    const result = await generateStructured<{ name: string }>({
      prompt: "Parse this",
      responseSchema: SCHEMA,
    });

    expect(result).toEqual({ name: "cumin" });
    const [endpoint, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_STRUCTURED_MODEL}:generateContent`,
    );
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig).toEqual({
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
    });
    expect(body.contents).toEqual([{ parts: [{ text: "Parse this" }] }]);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "test-gemini-key",
    );
  });

  it("honors a per-call model override", async () => {
    mockFetch.mockResolvedValueOnce(candidateResponse("{}"));

    await generateStructured({
      prompt: "p",
      responseSchema: SCHEMA,
      model: "gemini-2.5-flash",
    });

    expect(mockFetch.mock.calls[0][0]).toContain(
      "models/gemini-2.5-flash:generateContent",
    );
  });

  it("returns null on a non-retryable non-200", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("bad request", { status: 400 }),
    );

    expect(
      await generateStructured({ prompt: "p", responseSchema: SCHEMA }),
    ).toBeNull();
  });

  it("returns null when the candidate text is missing", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
    );

    expect(
      await generateStructured({ prompt: "p", responseSchema: SCHEMA }),
    ).toBeNull();
  });

  it("returns null when the candidate text is not valid JSON", async () => {
    mockFetch.mockResolvedValueOnce(candidateResponse("not json at all"));

    expect(
      await generateStructured({ prompt: "p", responseSchema: SCHEMA }),
    ).toBeNull();
  });

  // Transient failures now go through fetchWithRetry. Fake timers drive the
  // backoff so these don't actually wait.
  describe("retry behavior", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("retries then returns null (never throws) on a persistent network error", async () => {
      mockFetch.mockRejectedValue(new TypeError("fetch failed"));

      const p = generateStructured({ prompt: "p", responseSchema: SCHEMA });
      await vi.advanceTimersByTimeAsync(60_000);

      expect(await p).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("retries then returns null when the API keeps returning 429", async () => {
      mockFetch.mockResolvedValue(new Response("quota exceeded", { status: 429 }));

      const p = generateStructured({ prompt: "p", responseSchema: SCHEMA });
      await vi.advanceTimersByTimeAsync(60_000);

      expect(await p).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 attempt + 2 retries
    });

    it("recovers when a transient 503 is followed by success", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
        .mockResolvedValueOnce(candidateResponse('{"name":"cumin"}'));

      const p = generateStructured<{ name: string }>({
        prompt: "p",
        responseSchema: SCHEMA,
      });
      await vi.advanceTimersByTimeAsync(60_000);

      expect(await p).toEqual({ name: "cumin" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
