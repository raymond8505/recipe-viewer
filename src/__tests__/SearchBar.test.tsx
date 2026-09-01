import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn((key) => (key === "q" ? "pasta" : null)),
      toString: vi.fn(() => "q=pasta"),
    } as never);
    render(<SearchBar defaultValue="pasta" />);
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    expect(input.value).toBe("pasta");
  });

  it("syncs input value when searchParams changes externally", () => {
    const { rerender } = render(<SearchBar />);

    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn((key) => (key === "q" ? "tacos" : null)),
      toString: vi.fn(() => "q=tacos"),
    } as never);

    act(() => {
      rerender(<SearchBar />);
    });

    const input = screen.getByRole("searchbox") as HTMLInputElement;
    expect(input.value).toBe("tacos");
  });

  it("does not search while typing", () => {
    render(<SearchBar />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "chicken" } });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("sets q param on submit", () => {
    render(<SearchBar />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "chicken" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(mockPush).toHaveBeenCalledWith("/?q=chicken");
  });

  it("removes q param when input is cleared and submitted", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn((key) => (key === "q" ? "pasta" : null)),
      toString: vi.fn(() => "q=pasta"),
    } as never);

    render(<SearchBar defaultValue="pasta" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(mockPush).toHaveBeenCalledWith("/?");
  });

  it("removes page param when searching", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "sort=oldest&page=3"),
    } as never);

    render(<SearchBar />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pasta" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(mockPush).toHaveBeenCalledWith("/?sort=oldest&q=pasta");
  });

  it("preserves unrelated params when searching", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "sort=oldest"),
    } as never);

    render(<SearchBar />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pasta" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(mockPush).toHaveBeenCalledWith("/?sort=oldest&q=pasta");
  });

  it("submits on Enter key in the input", () => {
    render(<SearchBar />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pasta" } });
    fireEvent.submit(screen.getByRole("searchbox").closest("form")!);
    expect(mockPush).toHaveBeenCalledWith("/?q=pasta");
  });
});
