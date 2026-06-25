import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import SortableRow, { type DragHandleColor } from "@/components/editor/SortableRow";

function renderRow(color: DragHandleColor, id = "row-1") {
  return render(
    <DndContext>
      <SortableContext items={[id]}>
        <SortableRow id={id} color={color}>
          {({ handle }) => (
            <>
              {handle({ "aria-label": "Reorder cumin" })}
              <span>cumin</span>
            </>
          )}
        </SortableRow>
      </SortableContext>
    </DndContext>,
  );
}

describe("SortableRow", () => {
  it("renders the bound drag handle and the row children", () => {
    renderRow("neutral");
    expect(
      screen.getByRole("button", { name: "Reorder cumin" }),
    ).toBeInTheDocument();
    expect(screen.getByText("cumin")).toBeInTheDocument();
  });

  it("applies the neutral palette to the handle", () => {
    renderRow("neutral");
    expect(screen.getByRole("button", { name: "Reorder cumin" })).toHaveClass(
      "text-gray-300",
    );
  });

  it("applies the brand palette to the handle", () => {
    renderRow("brand");
    expect(screen.getByRole("button", { name: "Reorder cumin" })).toHaveClass(
      "text-brand",
    );
  });
});
