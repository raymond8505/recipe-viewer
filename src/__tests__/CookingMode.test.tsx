import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CookingMode from "@/components/CookingMode";
import type { RecipeRow, SchemaRecipe } from "@/types/recipe";

// useTimers is irrelevant to instruction completion; stub it out
vi.mock("@/hooks/useTimers", () => ({
  useTimers: () => ({
    timers: [],
    addTimer: vi.fn(),
    editTimer: vi.fn(),
    togglePause: vi.fn(),
    resetTimer: vi.fn(),
    dismissTimer: vi.fn(),
    removeTimer: vi.fn(),
    resetAll: vi.fn(),
  }),
  timerState: vi.fn(),
}));

function makeRecipe(schema: Partial<SchemaRecipe> = {}): RecipeRow {
  return {
    id: "1",
    url: "https://example.com",
    source: "example.com",
    metadata: { schema: { name: "Test Recipe", ...schema } },
  };
}

beforeEach(() => {
  // JSDOM does not implement requestFullscreen
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    value: vi.fn().mockResolvedValue(undefined),
    configurable: true,
  });
});

describe("CookingMode — instruction completion", () => {
  it("renders flat instruction steps", () => {
    const recipe = makeRecipe({
      recipeInstructions: [
        { text: "Boil water" },
        { text: "Add pasta" },
      ],
    });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    expect(screen.getAllByText("Boil water").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Add pasta").length).toBeGreaterThan(0);
  });

  it("marks a flat step as complete when tapped", () => {
    const recipe = makeRecipe({
      recipeInstructions: [{ text: "Boil water" }, { text: "Add pasta" }],
    });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);

    const step = screen.getAllByRole("button", { name: /step 1/i })[0];
    expect(step.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(step);
    expect(step.getAttribute("aria-pressed")).toBe("true");
  });

  it("untoggling a step marks it incomplete again", () => {
    const recipe = makeRecipe({
      recipeInstructions: [{ text: "Boil water" }],
    });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);

    const step = screen.getAllByRole("button", { name: /step 1/i })[0];
    fireEvent.click(step);
    expect(step.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(step);
    expect(step.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders sectioned instructions", () => {
    const recipe = makeRecipe({
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Prep",
          itemListElement: [{ text: "Chop onions" }],
        },
      ],
    });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    expect(screen.getAllByText("Chop onions").length).toBeGreaterThan(0);
  });

  it("marks a sectioned step complete when tapped", () => {
    const recipe = makeRecipe({
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Prep",
          itemListElement: [{ text: "Chop onions" }, { text: "Dice tomatoes" }],
        },
      ],
    });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);

    const step = screen.getAllByRole("button", { name: /step 1/i })[0];
    expect(step.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(step);
    expect(step.getAttribute("aria-pressed")).toBe("true");
  });

  it("completing one step does not affect other steps", () => {
    const recipe = makeRecipe({
      recipeInstructions: [{ text: "Step one" }, { text: "Step two" }],
    });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);

    const steps = screen.getAllByRole("button", { name: /step \d/i });
    fireEvent.click(steps[0]);
    expect(steps[0].getAttribute("aria-pressed")).toBe("true");
    expect(steps[1].getAttribute("aria-pressed")).toBe("false");
  });
});

describe("CookingMode — shopping list", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("ingredient rows render as unchecked checkboxes", () => {
    const recipe = makeRecipe({ recipeIngredient: ["2 cups flour", "1 tsp salt"] });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0].getAttribute("aria-checked")).toBe("false");
    expect(boxes[1].getAttribute("aria-checked")).toBe("false");
  });

  it("clicking an ingredient marks it checked", () => {
    const recipe = makeRecipe({ recipeIngredient: ["2 cups flour"] });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    const box = screen.getByRole("checkbox", { name: "2 cups flour" });
    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("true");
  });

  it("clicking a checked ingredient unchecks it", () => {
    const recipe = makeRecipe({ recipeIngredient: ["2 cups flour"] });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    const box = screen.getByRole("checkbox", { name: "2 cups flour" });
    fireEvent.click(box);
    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("false");
  });

  it("copy button is disabled when no ingredients are selected", () => {
    const recipe = makeRecipe({ recipeIngredient: ["2 cups flour"] });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /copy shopping list/i })).toBeDisabled();
  });

  it("copy button becomes enabled when an ingredient is selected", () => {
    const recipe = makeRecipe({ recipeIngredient: ["2 cups flour", "1 tsp salt"] });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    expect(screen.getByRole("button", { name: /copy shopping list, 1 item$/i })).not.toBeDisabled();
  });

  it("copy button aria-label reflects selection count", () => {
    const recipe = makeRecipe({ recipeIngredient: ["2 cups flour", "1 tsp salt"] });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "1 tsp salt" }));
    expect(screen.getByRole("button", { name: /copy shopping list, 2 items/i })).toBeTruthy();
  });

  it("clicking copy writes selected ingredient text to clipboard", async () => {
    const recipe = makeRecipe({ recipeIngredient: ["2 cups flour", "1 tsp salt"] });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "1 tsp salt" }));
    fireEvent.click(screen.getByRole("button", { name: /copy shopping list/i }));
    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("2 cups flour\n1 tsp salt");
    });
  });
});

describe("CookingMode — cooking notes", () => {
  it("renders cooking notes textareas (portrait + desktop)", () => {
    const recipe = makeRecipe({ cookingNotes: "less salt next time" });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    const textareas = screen.getAllByPlaceholderText(/note changes for next time/i);
    // Both portrait and desktop panels render (CSS hides one at runtime)
    expect(textareas.length).toBeGreaterThanOrEqual(1);
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("less salt next time");
  });

  it("shows empty textarea when recipe has no cookingNotes", () => {
    const recipe = makeRecipe({});
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    const textareas = screen.getAllByPlaceholderText(/note changes for next time/i);
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("");
  });

  it("updating the textarea changes its value", () => {
    const recipe = makeRecipe({});
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    const textareas = screen.getAllByPlaceholderText(/note changes for next time/i);
    fireEvent.change(textareas[0], { target: { value: "add more garlic" } });
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("add more garlic");
  });
});
