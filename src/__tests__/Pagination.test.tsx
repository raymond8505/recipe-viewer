import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Pagination from "@/components/Pagination";
import { useRouter, useSearchParams } from "next/navigation";

describe("Pagination", () => {
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

  it("renders nothing when total fits on one page", () => {
    const { container } = render(<Pagination page={1} total={20} pageSize={24} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when total is 0", () => {
    const { container } = render(<Pagination page={1} total={0} pageSize={24} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when total exactly equals page size", () => {
    const { container } = render(<Pagination page={1} total={24} pageSize={24} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders page X of Y", () => {
    render(<Pagination page={2} total={120} pageSize={24} />);
    expect(screen.getByText("Page 2 of 5")).toBeTruthy();
  });

  it("disables Previous button on page 1", () => {
    render(<Pagination page={1} total={100} pageSize={20} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("disables Next button on the last page", () => {
    render(<Pagination page={5} total={100} pageSize={20} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("enables both buttons on a middle page", () => {
    render(<Pagination page={3} total={100} pageSize={20} />);
    expect(screen.getByRole("button", { name: "Previous" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
  });

  it("navigates to next page when Next is clicked", () => {
    render(<Pagination page={2} total={100} pageSize={20} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(mockPush).toHaveBeenCalledWith("/?page=3");
  });

  it("navigates to previous page when Previous is clicked", () => {
    render(<Pagination page={3} total={100} pageSize={20} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(mockPush).toHaveBeenCalledWith("/?page=2");
  });

  it("preserves existing query params when navigating", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "q=pasta&sort=oldest"),
    } as never);

    render(<Pagination page={1} total={100} pageSize={20} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(mockPush).toHaveBeenCalledWith("/?q=pasta&sort=oldest&page=2");
  });
});
