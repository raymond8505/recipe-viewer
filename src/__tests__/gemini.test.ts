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

  it("returns null on non-200", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("quota exceeded", { status: 429 }),
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

  it("returns null when the request throws", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    expect(
      await generateStructured({ prompt: "p", responseSchema: SCHEMA }),
    ).toBeNull();
  });
});
