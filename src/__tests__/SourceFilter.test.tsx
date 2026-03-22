import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SourceFilter from "@/components/SourceFilter";
import { useRouter, useSearchParams } from "next/navigation";

const SOURCES = ["raymonds.recipes", "external.site"];

describe("SourceFilter", () => {
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

  it("renders an All button and one button per source", () => {
    render(<SourceFilter sources={SOURCES} current={undefined} />);
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("raymonds.recipes")).toBeTruthy();
    expect(screen.getByText("external.site")).toBeTruthy();
  });

  it("highlights All when no source is selected", () => {
    render(<SourceFilter sources={SOURCES} current={undefined} />);
    expect(screen.getByText("All").className).toContain("bg-orange-500");
  });

  it("does not highlight All when a source is selected", () => {
    render(<SourceFilter sources={SOURCES} current="raymonds.recipes" />);
    expect(screen.getByText("All").className).not.toContain("bg-orange-500");
  });

  it("highlights the active source button", () => {
    render(<SourceFilter sources={SOURCES} current="raymonds.recipes" />);
    expect(screen.getByText("raymonds.recipes").className).toContain("bg-orange-500");
  });

  it("does not highlight inactive source buttons", () => {
    render(<SourceFilter sources={SOURCES} current="raymonds.recipes" />);
    expect(screen.getByText("external.site").className).not.toContain("bg-orange-500");
  });

  it("removes source param when clicking All", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "source=raymonds.recipes"),
    } as never);

    render(<SourceFilter sources={SOURCES} current="raymonds.recipes" />);
    fireEvent.click(screen.getByText("All"));
    expect(mockPush).toHaveBeenCalledWith("/?");
  });

  it("sets source param when clicking a source", () => {
    render(<SourceFilter sources={SOURCES} current={undefined} />);
    fireEvent.click(screen.getByText("raymonds.recipes"));
    expect(mockPush).toHaveBeenCalledWith("/?source=raymonds.recipes");
  });

  it("removes page param when changing source", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "page=3"),
    } as never);

    render(<SourceFilter sources={SOURCES} current={undefined} />);
    fireEvent.click(screen.getByText("external.site"));
    expect(mockPush).toHaveBeenCalledWith("/?source=external.site");
  });

  it("preserves unrelated params when changing source", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "q=pasta&sort=oldest"),
    } as never);

    render(<SourceFilter sources={SOURCES} current={undefined} />);
    fireEvent.click(screen.getByText("raymonds.recipes"));
    expect(mockPush).toHaveBeenCalledWith("/?q=pasta&sort=oldest&source=raymonds.recipes");
  });
});
