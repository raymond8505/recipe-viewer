import { describe, it, expect } from "vitest";
import { hashUrl } from "@/lib/hash";

describe("hashUrl", () => {
  it("returns an 8-character hex string", () => {
    const result = hashUrl("https://example.com/recipe");
    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic — same input produces same output", () => {
    const url = "https://www.food.com/recipe/chocolate-cake";
    expect(hashUrl(url)).toBe(hashUrl(url));
  });

  it("produces different hashes for different URLs", () => {
    expect(hashUrl("https://example.com/a")).not.toBe(
      hashUrl("https://example.com/b")
    );
  });

  it("handles empty string", () => {
    const result = hashUrl("");
    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it("handles URLs with query strings", () => {
    const a = hashUrl("https://example.com/recipe?id=1");
    const b = hashUrl("https://example.com/recipe?id=2");
    expect(a).not.toBe(b);
  });
});
