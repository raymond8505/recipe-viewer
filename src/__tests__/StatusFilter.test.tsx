import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StatusFilter from "@/components/StatusFilter";
import { useRouter, useSearchParams } from "next/navigation";

const COUNTS = { published: 10, draft: 3, archived: 2, __null: 5 };

// Counts render inside the button as a badge, so the accessible name is
// "<label> <count>" — queried by role+name rather than a single text node.
const button = (name: string) => screen.getByRole("button", { name });

describe("StatusFilter", () => {
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

  it("renders All, Published, Draft, and Archived buttons with count badges", () => {
    render(<StatusFilter counts={COUNTS} current={undefined} />);
    expect(button("All 18")).toBeTruthy(); // 10 + 3 + 5 (__null), not archived
    expect(button("Published 10")).toBeTruthy();
    expect(button("Draft 3")).toBeTruthy();
    expect(button("Archived 2")).toBeTruthy();
    // the count itself sits in the internal badge, not in the label text
    expect(
      button("Published 10").querySelector('[data-slot="badge"]'),
    ).toHaveTextContent("10");
  });

  it("shows zero counts when counts object is empty", () => {
    render(<StatusFilter counts={{}} current={undefined} />);
    expect(button("All 0")).toBeTruthy();
    expect(button("Published 0")).toBeTruthy();
    expect(button("Draft 0")).toBeTruthy();
    expect(button("Archived 0")).toBeTruthy();
  });

  it("marks All as pressed when no status is selected", () => {
    render(<StatusFilter counts={COUNTS} current={undefined} />);
    expect(button("All 18")).toHaveAttribute("aria-pressed", "true");
  });

  it("does not mark All as pressed when a status is selected", () => {
    render(<StatusFilter counts={COUNTS} current="published" />);
    expect(button("All 18")).toHaveAttribute("aria-pressed", "false");
  });

  it("marks the active status button as pressed", () => {
    render(<StatusFilter counts={COUNTS} current="draft" />);
    expect(button("Draft 3")).toHaveAttribute("aria-pressed", "true");
  });

  it("does not mark inactive status buttons as pressed", () => {
    render(<StatusFilter counts={COUNTS} current="draft" />);
    expect(button("Published 10")).toHaveAttribute("aria-pressed", "false");
    expect(button("Archived 2")).toHaveAttribute("aria-pressed", "false");
  });

  it("removes status param when clicking All", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "status=draft"),
    } as never);

    render(<StatusFilter counts={COUNTS} current="draft" />);
    fireEvent.click(button("All 18"));
    expect(mockPush).toHaveBeenCalledWith("/?");
  });

  it("sets status param when clicking a status", () => {
    render(<StatusFilter counts={COUNTS} current={undefined} />);
    fireEvent.click(button("Archived 2"));
    expect(mockPush).toHaveBeenCalledWith("/?status=archived");
  });

  it("removes page param when changing status", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "page=3"),
    } as never);

    render(<StatusFilter counts={COUNTS} current={undefined} />);
    fireEvent.click(button("Draft 3"));
    expect(mockPush).toHaveBeenCalledWith("/?status=draft");
  });

  it("preserves unrelated params when changing status", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(),
      toString: vi.fn(() => "q=pasta&sort=oldest"),
    } as never);

    render(<StatusFilter counts={COUNTS} current={undefined} />);
    fireEvent.click(button("Published 10"));
    expect(mockPush).toHaveBeenCalledWith(
      "/?q=pasta&sort=oldest&status=published",
    );
  });
});
