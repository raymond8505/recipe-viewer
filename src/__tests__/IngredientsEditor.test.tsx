import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import IngredientsEditor from "@/components/editor/IngredientsEditor";
import type { EditableIngredients } from "@/types/editor";

function Harness({ initial }: { initial: EditableIngredients }) {
  const [groups, setGroups] = useState(initial);
  return <IngredientsEditor value={groups} onChange={setGroups} />;
}

const oneUngrouped: EditableIngredients = [
  { id: "g0", heading: null, items: [{ id: "a", name: "1 onion" }] },
];

describe("IngredientsEditor", () => {
  it("renders an input per ingredient", () => {
    render(<Harness initial={oneUngrouped} />);
    const inputs = screen.getAllByLabelText("Ingredient") as HTMLInputElement[];
    expect(inputs).toHaveLength(1);
    expect(inputs[0].value).toBe("1 onion");
  });

  it("edits an ingredient", () => {
    render(<Harness initial={oneUngrouped} />);
    const input = screen.getByLabelText("Ingredient") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2 onions" } });
    expect(
      (screen.getByLabelText("Ingredient") as HTMLInputElement).value,
    ).toBe("2 onions");
  });

  it("adds an ingredient to the bottom of the list", () => {
    render(<Harness initial={oneUngrouped} />);
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    expect(screen.getAllByLabelText("Ingredient")).toHaveLength(2);
  });

  it("adds a group", () => {
    render(<Harness initial={oneUngrouped} />);
    fireEvent.click(screen.getByRole("button", { name: "Add group" }));
    expect(screen.getByLabelText("Group name")).toBeInTheDocument();
  });

  it("deletes an ingredient only after confirming", () => {
    render(<Harness initial={oneUngrouped} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Delete this ingredient?" }),
    );
    // Row is swapped for the confirm bar; cancelling restores it (not deleted).
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Ingredient")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Delete this ingredient?" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByLabelText("Ingredient")).not.toBeInTheDocument();
  });

  it("group delete confirm states the contained-ingredient count", () => {
    render(
      <Harness
        initial={[
          {
            id: "g1",
            heading: "Spices",
            items: [
              { id: "a", name: "cumin" },
              { id: "b", name: "salt" },
            ],
          },
        ]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete section Spices" }),
    );
    expect(screen.getByText(/and its 2 ingredients\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByLabelText("Group name")).not.toBeInTheDocument();
  });

  it("adds an ingredient to the bottom of a specific group", () => {
    render(
      <Harness
        initial={[
          { id: "g1", heading: "Dough", items: [{ id: "a", name: "flour" }] },
        ]}
      />,
    );
    // The group has its own "Add ingredient" footer button (the first one).
    const addButtons = screen.getAllByRole("button", {
      name: "Add ingredient",
    });
    fireEvent.click(addButtons[0]);
    expect(screen.getAllByLabelText("Ingredient")).toHaveLength(2);
  });
});
