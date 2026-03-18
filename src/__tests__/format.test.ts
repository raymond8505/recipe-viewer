import { describe, it, expect } from "vitest";
import { formatDuration, formatDate, getFirstImage, toArray } from "@/lib/format";

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration("PT1H30M")).toBe("1 hr 30 min");
  });

  it("formats minutes only", () => {
    expect(formatDuration("PT45M")).toBe("45 min");
  });

  it("formats hours only", () => {
    expect(formatDuration("PT2H")).toBe("2 hr");
  });

  it("returns null for zero duration", () => {
    expect(formatDuration("PT0S")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(formatDuration(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(formatDuration(null)).toBeNull();
  });

  it("returns null for invalid format", () => {
    expect(formatDuration("not-a-duration")).toBeNull();
  });

  it("handles multi-digit hours and minutes", () => {
    expect(formatDuration("PT12H45M")).toBe("12 hr 45 min");
  });
});

describe("formatDate", () => {
  it("formats an ISO date", () => {
    expect(formatDate("2026-02-25")).toBe("February 25, 2026");
  });

  it("returns null for undefined", () => {
    expect(formatDate(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(formatDate(null)).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(formatDate("not-a-date")).toBeNull();
  });
});

describe("getFirstImage", () => {
  it("returns string image directly", () => {
    expect(getFirstImage("https://example.com/img.jpg")).toBe(
      "https://example.com/img.jpg"
    );
  });

  it("returns first element of array", () => {
    expect(
      getFirstImage(["https://example.com/a.jpg", "https://example.com/b.jpg"])
    ).toBe("https://example.com/a.jpg");
  });

  it("returns null for empty array", () => {
    expect(getFirstImage([])).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(getFirstImage(undefined)).toBeNull();
  });
});

describe("toArray", () => {
  it("wraps a string in an array", () => {
    expect(toArray("Breakfast")).toEqual(["Breakfast"]);
  });

  it("returns array as-is", () => {
    expect(toArray(["Breakfast", "Lunch"])).toEqual(["Breakfast", "Lunch"]);
  });

  it("returns empty array for undefined", () => {
    expect(toArray(undefined)).toEqual([]);
  });

  it("filters empty strings", () => {
    expect(toArray(["Breakfast", "", "Lunch"])).toEqual(["Breakfast", "Lunch"]);
  });
});
