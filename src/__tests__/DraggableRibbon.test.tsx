import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DraggableRibbon, { RibbonItem } from "@/components/cooking/DraggableRibbon";

describe("DraggableRibbon", () => {
  it("renders children", () => {
    render(
      <DraggableRibbon>
        <span>Item A</span>
        <span>Item B</span>
      </DraggableRibbon>
    );
    expect(screen.getByText("Item A")).toBeTruthy();
    expect(screen.getByText("Item B")).toBeTruthy();
  });

  it("applies overflow-x-auto for native scroll", () => {
    const { container } = render(
      <DraggableRibbon>
        <span>child</span>
      </DraggableRibbon>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("overflow-x-auto");
  });

  it("applies extra className", () => {
    const { container } = render(
      <DraggableRibbon className="gap-4 px-3">
        <span>child</span>
      </DraggableRibbon>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("gap-4");
    expect(el.className).toContain("px-3");
  });
});

describe("RibbonItem", () => {
  it("snaps and bounds its width, leaving the card to size to its content", () => {
    const { container } = render(<RibbonItem>child</RibbonItem>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("snap-start");
    expect(el.className).toContain("shrink-0");
    expect(el.className).toContain("min-w-56");
    expect(el.className).toContain("max-w-72");
    // `\b` would match the `w-` inside `min-w-56`; anchor on a class start.
    expect(el.className).not.toMatch(/(^|\s)w-\d+/);
  });

  it("forwards data attributes so both timer views can be targeted by id", () => {
    const { container } = render(
      <RibbonItem data-timer-id="t1">child</RibbonItem>
    );
    expect(container.querySelector("[data-timer-id='t1']")).not.toBeNull();
  });
});
