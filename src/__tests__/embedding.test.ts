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

  it("L2-normalizes the returned vector", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ embedding: { values: [3, 4] } })));

    const result = await generateEmbedding("text");

    expect(result).toEqual([0.6, 0.8]);
    // Unit length
    const magnitude = Math.sqrt(result!.reduce((s, v) => s + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 10);
  });

  it("returns null on a non-200 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 429 })));

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

  it("returns null (never throws) on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));

    await expect(generateEmbedding("text")).resolves.toBeNull();
  });
});
