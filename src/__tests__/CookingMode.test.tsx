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
