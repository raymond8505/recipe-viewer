import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DraggableRibbon from "@/components/cooking/DraggableRibbon";

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
