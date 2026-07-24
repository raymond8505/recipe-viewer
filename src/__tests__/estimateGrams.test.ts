// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimateLineGrams } from "@/lib/normalization/estimateGrams";
import { generateStructured } from "@/lib/gemini";

vi.mock("@/lib/gemini", () => ({ generateStructured: vi.fn() }));

const LINE = {
  rawText: "3 tbsp chopped garlic",
  name: "chopped garlic",
  quantity: 3,
  unit: "tbsp",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("estimateLineGrams", () => {
  it("returns the model's positive gram estimate", async () => {
    vi.mocked(generateStructured).mockResolvedValue({ grams: 26 });
    await expect(estimateLineGrams(LINE)).resolves.toBe(26);
  });

  it("passes the line through to the structured prompt", async () => {
    vi.mocked(generateStructured).mockResolvedValue({ grams: 26 });
    await estimateLineGrams(LINE);
    const prompt = vi.mocked(generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("3 tbsp chopped garlic");
    expect(prompt).toContain("chopped garlic");
  });

  it("returns null when the model declines (grams null)", async () => {
    vi.mocked(generateStructured).mockResolvedValue({ grams: null });
    await expect(estimateLineGrams(LINE)).resolves.toBeNull();
  });

  it("returns null when the client fails (returns null)", async () => {
    vi.mocked(generateStructured).mockResolvedValue(null);
    await expect(estimateLineGrams(LINE)).resolves.toBeNull();
  });

  it("rejects non-positive and non-finite values", async () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      vi.mocked(generateStructured).mockResolvedValue({ grams: bad });
      await expect(estimateLineGrams(LINE)).resolves.toBeNull();
    }
  });
});
