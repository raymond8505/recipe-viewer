// @vitest-environment node
import { describe, it, expect } from "vitest";
import { recipeImageUploadInputSchema } from "@/lib/schemas/recipe";

describe("recipeImageUploadInputSchema", () => {
  it("accepts base64 at the cap", () => {
    const result = recipeImageUploadInputSchema.safeParse({
      id: "r1",
      imageBase64: "a".repeat(1_400_000),
      contentType: "image/png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects oversized base64 with a message naming the fast paths", () => {
    const result = recipeImageUploadInputSchema.safeParse({
      id: "r1",
      imageBase64: "a".repeat(1_400_001),
      contentType: "image/png",
    });
    expect(result.success).toBe(false);
    const message = result.success ? "" : result.error.issues[0].message;
    expect(message).toMatch(/imageUrl/);
    expect(message).toMatch(/upload-image/);
  });
});
