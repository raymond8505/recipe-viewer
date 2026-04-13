import { describe, it, expect } from "vitest";
import { getFeatures } from "@/lib/features";

describe("getFeatures", () => {
  it("enables filters when not logged in", () => {
    const features = getFeatures(false);
    expect(features.filterByStatus).toBe(true);
    expect(features.showSourceFilter).toBe(false);
    expect(features.showStatusFilter).toBe(false);
  });

  it("disables filters when logged in", () => {
    const features = getFeatures(true);
    expect(features.filterByStatus).toBe(false);
    expect(features.showSourceFilter).toBe(true);
    expect(features.showStatusFilter).toBe(true);
  });
});
