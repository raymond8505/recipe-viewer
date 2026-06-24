import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SortBar from "@/components/SortBar";
import { useRouter, useSearchParams } from "next/navigation";

describe("SortBar", () => {
  let mockPush: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
    });
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => ""),
    } as never);
  });

  it("renders all four sort options", () => {
    render(<SortBar current="newest" />);
    expect(screen.getByText("Newest")).toBeTruthy();
    expect(screen.getByText("Oldest")).toBeTruthy();
    expect(screen.getByText("Name A\u2013Z")).toBeTruthy();
    expect(screen.getByText("Name Z\u2013A")).toBeTruthy();
  });

  it("marks the active sort option as pressed", () => {
    render(<SortBar current="oldest" />);
    expect(screen.getByText("Oldest")).toHaveAttribute("aria-pressed", "true");
  });

  it("does not mark inactive sort options as pressed", () => {
    render(<SortBar current="oldest" />);
    expect(screen.getByText("Newest")).toHaveAttribute("aria-pressed", "false");
  });

  it("removes the sort param when clicking Newest (the default sort)", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "sort=oldest"),
    } as never);

    render(<SortBar current="oldest" />);
    fireEvent.click(screen.getByText("Newest"));
    // sort param removed, page param deleted, result is empty params → "/?""
    expect(mockPush).toHaveBeenCalledWith("/?");
  });

  it("sets the sort param when clicking a non-default option", () => {
    render(<SortBar current="newest" />);
    fireEvent.click(screen.getByText("Oldest"));
    expect(mockPush).toHaveBeenCalledWith("/?sort=oldest");
  });

  it("removes the page param when changing sort", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "q=pasta&page=3"),
    } as never);

    render(<SortBar current="newest" />);
    fireEvent.click(screen.getByText("Oldest"));
    expect(mockPush).toHaveBeenCalledWith("/?q=pasta&sort=oldest");
  });

  it("preserves unrelated params when changing sort", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "q=chicken"),
    } as never);

    render(<SortBar current="newest" />);
    fireEvent.click(screen.getByText("Name A\u2013Z"));
    expect(mockPush).toHaveBeenCalledWith("/?q=chicken&sort=name-asc");
  });
});
