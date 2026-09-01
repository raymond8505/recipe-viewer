// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimateDensity } from "@/lib/normalization/estimateDensity";
import { generateStructured } from "@/lib/gemini";

vi.mock("@/lib/gemini", () => ({ generateStructured: vi.fn() }));

const INPUT = {
  name: "egg",
  usdaDescription: "Eggs, Grade A, Large, egg whole",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("estimateDensity", () => {
  it("returns the model's positive g/ml estimate rounded to 3 decimals", async () => {
    vi.mocked(generateStructured).mockResolvedValue({ grams_per_ml: 1.0315 });
    await expect(estimateDensity(INPUT)).resolves.toBe(1.032);
  });

  it("passes the name and USDA description through to the structured prompt", async () => {
    vi.mocked(generateStructured).mockResolvedValue({ grams_per_ml: 1.03 });
    await estimateDensity(INPUT);
    const prompt = vi.mocked(generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("egg");
    expect(prompt).toContain("Eggs, Grade A, Large, egg whole");
  });

  it("returns null when the model declines (grams_per_ml null)", async () => {
    vi.mocked(generateStructured).mockResolvedValue({ grams_per_ml: null });
    await expect(estimateDensity(INPUT)).resolves.toBeNull();
  });

  it("returns null when the client fails (returns null)", async () => {
    vi.mocked(generateStructured).mockResolvedValue(null);
    await expect(estimateDensity(INPUT)).resolves.toBeNull();
  });

  it("rejects non-positive, non-finite, and food-implausible values", async () => {
    // 148 would be a model answering kcal (or grams) instead of g/ml — the
    // plausibility cap keeps it from silently corrupting volume conversions.
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 148]) {
      vi.mocked(generateStructured).mockResolvedValue({ grams_per_ml: bad });
      await expect(estimateDensity(INPUT)).resolves.toBeNull();
    }
  });
});
