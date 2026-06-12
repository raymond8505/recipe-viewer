// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdminClient: vi.fn(),
}));

import { fetchImageBytes, StorageUploadError } from "@/lib/storage";

function makeResponse(
  body: Uint8Array,
  contentType = "image/png",
  init: { contentLength?: string; status?: number } = {},
): Response {
  const headers = new Headers({ "content-type": contentType });
  if (init.contentLength) headers.set("content-length", init.contentLength);
  return new Response(body, { status: init.status ?? 200, headers });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchImageBytes — SSRF guards", () => {
  it("rejects file: scheme as bad_url", async () => {
    await expect(fetchImageBytes("file:///etc/passwd")).rejects.toMatchObject({
      kind: "bad_url",
    });
  });

  it("rejects an IPv4 literal in a private range", async () => {
    await expect(fetchImageBytes("http://10.0.0.1/x.png")).rejects.toMatchObject({
      kind: "bad_url",
    });
  });

  it("rejects loopback IPv4", async () => {
    await expect(fetchImageBytes("http://127.0.0.1/x.png")).rejects.toMatchObject({
      kind: "bad_url",
    });
  });

  it("rejects loopback IPv6", async () => {
    await expect(fetchImageBytes("http://[::1]/x.png")).rejects.toMatchObject({
      kind: "bad_url",
    });
  });

  it("rejects link-local IPv4 (AWS metadata)", async () => {
    await expect(
      fetchImageBytes("http://169.254.169.254/latest/meta-data/"),
    ).rejects.toMatchObject({ kind: "bad_url" });
  });

  it("rejects a malformed URL", async () => {
    await expect(fetchImageBytes("not-a-url")).rejects.toMatchObject({
      kind: "bad_url",
    });
  });
});

describe("fetchImageBytes — response validation", () => {
  it("rejects responses with non-image content-type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeResponse(new Uint8Array([1, 2, 3]), "text/html"),
    );
    await expect(
      fetchImageBytes("https://example.com/x"),
    ).rejects.toMatchObject({ kind: "unsupported_type" });
  });

  it("rejects responses whose declared content-length exceeds the cap", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeResponse(new Uint8Array([1]), "image/png", {
        contentLength: "9999999",
      }),
    );
    await expect(
      fetchImageBytes("https://example.com/big"),
    ).rejects.toMatchObject({ kind: "too_large" });
  });

  it("rejects responses whose streamed body grows past the cap", async () => {
    // No content-length, but body exceeds the cap when streamed
    const big = new Uint8Array(4_000_001);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeResponse(big, "image/png"),
    );
    await expect(
      fetchImageBytes("https://example.com/big"),
    ).rejects.toMatchObject({ kind: "too_large" });
  });

  it("rejects non-2xx responses as fetch_failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeResponse(new Uint8Array([]), "image/png", { status: 404 }),
    );
    await expect(
      fetchImageBytes("https://example.com/missing"),
    ).rejects.toMatchObject({ kind: "fetch_failed" });
  });

  it("returns bytes + content type on a happy path", async () => {
    const payload = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeResponse(payload, "image/png"),
    );
    const out = await fetchImageBytes("https://example.com/x.png");
    expect(out.contentType).toBe("image/png");
    expect(out.bytes).toEqual(Buffer.from(payload));
  });

  it("rethrows network errors as fetch_failed", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(
      fetchImageBytes("https://example.com/x"),
    ).rejects.toMatchObject({ kind: "fetch_failed" });
  });
});

describe("StorageUploadError shape", () => {
  it("preserves kind and detail", () => {
    const e = new StorageUploadError("bad_url", "nope");
    expect(e.kind).toBe("bad_url");
    expect(e.detail).toBe("nope");
    expect(e.message).toContain("bad_url");
  });
});
