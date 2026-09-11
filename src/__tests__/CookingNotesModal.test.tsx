import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CookingNotesModal from "@/components/cooking/CookingNotesModal";

describe("CookingNotesModal", () => {
  it("shows the current notes in a focused textarea", () => {
    render(
      <CookingNotesModal
        value="use more garlic"
        onChange={vi.fn()}
        saveState="idle"
        onClose={vi.fn()}
      />,
    );
    const textarea = screen.getByPlaceholderText(/note changes for next time/i);
    expect((textarea as HTMLTextAreaElement).value).toBe("use more garlic");
    expect(document.activeElement).toBe(textarea);
  });

  it("calls onChange with the edited text", () => {
    const onChange = vi.fn();
    render(
      <CookingNotesModal value="" onChange={onChange} saveState="idle" onClose={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/note changes for next time/i), {
      target: { value: "add salt earlier" },
    });
    expect(onChange).toHaveBeenCalledWith("add salt earlier");
  });

  it.each([
    ["saving", /saving…/i],
    ["saved", /saved ✓/i],
    ["error", /error saving/i],
  ] as const)("shows the %s indicator", (saveState, label) => {
    render(
      <CookingNotesModal value="" onChange={vi.fn()} saveState={saveState} onClose={vi.fn()} />,
    );
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("shows no indicator when idle", () => {
    render(
      <CookingNotesModal value="" onChange={vi.fn()} saveState="idle" onClose={vi.fn()} />,
    );
    expect(screen.queryByText(/saving…|saved ✓|error saving/i)).toBeNull();
  });

  it.each([
    ["Done", () => fireEvent.click(screen.getByRole("button", { name: "Done" }))],
    ["the close button", () => fireEvent.click(screen.getByRole("button", { name: "Close" }))],
    ["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
    ["a backdrop click", () => fireEvent.click(screen.getByRole("dialog"))],
  ])("closes on %s", (_, trigger) => {
    const onClose = vi.fn();
    render(
      <CookingNotesModal value="" onChange={vi.fn()} saveState="idle" onClose={onClose} />,
    );
    trigger();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("stays open when the textarea is clicked", () => {
    const onClose = vi.fn();
    render(
      <CookingNotesModal value="" onChange={vi.fn()} saveState="idle" onClose={onClose} />,
    );
    fireEvent.click(screen.getByPlaceholderText(/note changes for next time/i));
    expect(onClose).not.toHaveBeenCalled();
  });
});
