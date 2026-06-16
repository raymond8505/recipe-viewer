// @vitest-environment node
import { describe, it, expect } from "vitest";
import { recipeImageUploadInputSchema } from "@/lib/schemas/recipe";

describe("recipeImageUploadInputSchema", () => {
  it("accepts an id and a valid imageUrl", () => {
    const result = recipeImageUploadInputSchema.safeParse({
      id: "r1",
      imageUrl: "https://example.com/foo.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing imageUrl", () => {
    const result = recipeImageUploadInputSchema.safeParse({ id: "r1" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-URL imageUrl", () => {
    const result = recipeImageUploadInputSchema.safeParse({
      id: "r1",
      imageUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});
