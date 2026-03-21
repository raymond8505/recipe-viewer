import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SearchBar from "@/components/SearchBar";
import { useRouter, useSearchParams } from "next/navigation";

describe("SearchBar", () => {
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

  it("renders the search input", () => {
    render(<SearchBar />);
    expect(screen.getByRole("searchbox")).toBeTruthy();
  });

  it("shows the defaultValue in the input", () => {
    render(<SearchBar defaultValue="pasta" />);
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    expect(input.defaultValue).toBe("pasta");
  });

  it("sets q param when typing a value", () => {
    render(<SearchBar />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "chicken" } });
    expect(mockPush).toHaveBeenCalledWith("/?q=chicken");
  });

  it("removes q param when input is cleared", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "q=pasta"),
    } as never);

    render(<SearchBar defaultValue="pasta" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(mockPush).toHaveBeenCalledWith("/?");
  });

  it("removes page param when searching", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "sort=oldest&page=3"),
    } as never);

    render(<SearchBar />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pasta" } });
    expect(mockPush).toHaveBeenCalledWith("/?sort=oldest&q=pasta");
  });

  it("preserves unrelated params when searching", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "sort=oldest"),
    } as never);

    render(<SearchBar />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pasta" } });
    expect(mockPush).toHaveBeenCalledWith("/?sort=oldest&q=pasta");
  });
});
