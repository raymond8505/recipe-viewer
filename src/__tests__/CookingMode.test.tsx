import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CookingMode from "@/components/CookingMode";
import type { RecipeInstructionGroup, RecipeRow, SchemaRecipe } from "@/types/recipe";
import { makeIngredientLines, makeInstructionGroup, makeStep, makeSteps } from "@/fixtures";

// The timer store is stubbed; `addTimer` is observable so the seeding rule
// (a step with both a label and a duration) can be asserted.
const mockAddTimer = vi.hoisted(() => vi.fn(() => "timer-id"));
vi.mock("@/hooks/useTimers", () => ({
  useTimers: () => ({
    timers: [],
    addTimer: mockAddTimer,
    editTimer: vi.fn(),
    togglePause: vi.fn(),
    resetTimer: vi.fn(),
    dismissTimer: vi.fn(),
    removeTimer: vi.fn(),
    resetAll: vi.fn(),
  }),
  timerState: vi.fn(),
}));

function makeRecipe(
  schema: Partial<SchemaRecipe> = {},
  ingredients: string[] = [],
  instructions: RecipeInstructionGroup[] = [],
): RecipeRow {
  return {
    id: "1",
    url: "https://example.com",
    source: "example.com",
    ingredients: makeIngredientLines(ingredients),
    instructions,
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
  it("renders a nameless run of steps", () => {
    const recipe = makeRecipe({}, [], makeSteps(["Boil water", "Add pasta"]));
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    expect(screen.getAllByText("Boil water").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Add pasta").length).toBeGreaterThan(0);
  });

  it("marks a step as complete when tapped", () => {
    const recipe = makeRecipe({}, [], makeSteps(["Boil water", "Add pasta"]));
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);

    const step = screen.getAllByRole("button", { name: /step 1/i })[0];
    expect(step.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(step);
    expect(step.getAttribute("aria-pressed")).toBe("true");
  });

  it("untoggling a step marks it incomplete again", () => {
    const recipe = makeRecipe({}, [], makeSteps(["Boil water"]));
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);

    const step = screen.getAllByRole("button", { name: /step 1/i })[0];
    fireEvent.click(step);
    expect(step.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(step);
    expect(step.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders a named group under its heading", () => {
    const recipe = makeRecipe({}, [], [makeInstructionGroup("Prep", ["Chop onions"])]);
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    expect(screen.getAllByText("Prep").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Chop onions").length).toBeGreaterThan(0);
  });

  // Completion is keyed per group, so the first step of each group is its own
  // "step 1" and toggling one leaves the other alone.
  it("tracks completion per group, not per step number", () => {
    const recipe = makeRecipe({}, [], [
      makeInstructionGroup(undefined, ["Preheat"]),
      makeInstructionGroup("Prep", ["Chop onions", "Dice tomatoes"]),
    ]);
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);

    const [first, second] = screen.getAllByRole("button", { name: /step 1/i });
    fireEvent.click(second);
    expect(second.getAttribute("aria-pressed")).toBe("true");
    expect(first.getAttribute("aria-pressed")).toBe("false");
  });

  it("completing one step does not affect other steps", () => {
    const recipe = makeRecipe({}, [], makeSteps(["Step one", "Step two"]));
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);

    const steps = screen.getAllByRole("button", { name: /step \d/i });
    fireEvent.click(steps[0]);
    expect(steps[0].getAttribute("aria-pressed")).toBe("true");
    expect(steps[1].getAttribute("aria-pressed")).toBe("false");
  });
});

describe("CookingMode — timers seeded from steps", () => {
  beforeEach(() => mockAddTimer.mockClear());

  it("seeds one timer per step carrying both a label and a duration", () => {
    const recipe = makeRecipe({}, [], [
      makeInstructionGroup(undefined, [makeStep("Rest.", { name: "Rest" }), "Plain."]),
      makeInstructionGroup("Sauce", [makeStep("Simmer.", { name: "Simmer", seconds: 330 })]),
    ]);
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);

    expect(mockAddTimer).toHaveBeenCalledTimes(1);
    expect(mockAddTimer).toHaveBeenCalledWith("Simmer", 330, true);
  });
});

describe("CookingMode — shopping list", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("ingredient rows render as unchecked checkboxes", () => {
    const recipe = makeRecipe({}, ["2 cups flour", "1 tsp salt"]);
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0].getAttribute("aria-checked")).toBe("false");
    expect(boxes[1].getAttribute("aria-checked")).toBe("false");
  });

  it("clicking an ingredient marks it checked", () => {
    const recipe = makeRecipe({}, ["2 cups flour"]);
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    const box = screen.getByRole("checkbox", { name: "2 cups flour" });
    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("true");
  });

  it("clicking a checked ingredient unchecks it", () => {
    const recipe = makeRecipe({}, ["2 cups flour"]);
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    const box = screen.getByRole("checkbox", { name: "2 cups flour" });
    fireEvent.click(box);
    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("false");
  });

  it("copy button is disabled when no ingredients are selected", () => {
    const recipe = makeRecipe({}, ["2 cups flour"]);
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /copy shopping list/i })).toBeDisabled();
  });

  it("copy button becomes enabled when an ingredient is selected", () => {
    const recipe = makeRecipe({}, ["2 cups flour", "1 tsp salt"]);
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    expect(screen.getByRole("button", { name: /copy shopping list, 1 item$/i })).not.toBeDisabled();
  });

  it("copy button aria-label reflects selection count", () => {
    const recipe = makeRecipe({}, ["2 cups flour", "1 tsp salt"]);
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "1 tsp salt" }));
    expect(screen.getByRole("button", { name: /copy shopping list, 2 items/i })).toBeTruthy();
  });

  it("clicking copy writes selected ingredient text to clipboard", async () => {
    const recipe = makeRecipe({}, ["2 cups flour", "1 tsp salt"]);
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "1 tsp salt" }));
    fireEvent.click(screen.getByRole("button", { name: /copy shopping list/i }));
    // RTL's waitFor (not vi.waitFor): it suspends the act environment while
    // polling, so the post-clipboard "copied" state update doesn't warn.
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("2 cups flour\n1 tsp salt");
    });
  });

  it("copies scaled amounts after the recipe is scaled", async () => {
    const recipe = makeRecipe({ recipeYield: "1 serving" }, ["2 cups flour", "1 tsp salt"]);
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    // Selection is keyed by the line's id, so it survives the scale change.
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "1 tsp salt" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase servings" }));
    fireEvent.click(screen.getByRole("button", { name: /copy shopping list/i }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("4 cups flour\n2 tsp salt");
    });
  });

  it("scales only the primary recipe's lines in a meal", async () => {
    // Scaling is primary-only, and the copy now reads through `scalables`
    // rather than each recipe's schema — a secondary must still contribute its
    // selected lines, unscaled.
    const secondary = makeRecipe({ name: "Side Salad" }, ["1 cup rice"]);
    secondary.id = "2";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ data: [secondary] }) }),
    );
    const recipe = makeRecipe({ recipeYield: "1 serving" }, ["2 cups flour"]);
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Add recipe to meal…"), {
      target: { value: "salad" },
    });
    const option = await screen.findByRole("option", { name: /Side Salad/ });
    fireEvent.click(option);

    // Primary tab is still active: select its line and double the recipe.
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase servings" }));

    fireEvent.click(screen.getByRole("tab", { name: /Side Salad/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "1 cup rice" }));

    fireEvent.click(screen.getByRole("button", { name: /copy shopping list/i }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("4 cups flour\n1 cup rice");
    });
    vi.unstubAllGlobals();
  });
});

describe("CookingMode — cooking notes", () => {
  it("does not render notes textarea when logged out", () => {
    const recipe = makeRecipe({ cookingNotes: "less salt next time" });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    expect(screen.queryByPlaceholderText(/note changes for next time/i)).toBeNull();
  });

  it("renders cooking notes textareas when logged in", () => {
    const recipe = makeRecipe({ cookingNotes: "less salt next time" });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} isLoggedIn />);
    const textareas = screen.getAllByPlaceholderText(/note changes for next time/i);
    // Both portrait and desktop panels render (CSS hides one at runtime)
    expect(textareas.length).toBeGreaterThanOrEqual(1);
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("less salt next time");
  });

  it("shows empty textarea when recipe has no cookingNotes (logged in)", () => {
    const recipe = makeRecipe({});
    render(<CookingMode recipe={recipe} onClose={vi.fn()} isLoggedIn />);
    const textareas = screen.getAllByPlaceholderText(/note changes for next time/i);
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("");
  });

  it("updating the textarea changes its value (logged in)", () => {
    const recipe = makeRecipe({});
    render(<CookingMode recipe={recipe} onClose={vi.fn()} isLoggedIn />);
    const textareas = screen.getAllByPlaceholderText(/note changes for next time/i);
    fireEvent.change(textareas[0], { target: { value: "add more garlic" } });
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("add more garlic");
  });
});

describe("CookingMode — nutrition panel", () => {
  const nutritious = () => makeRecipe({ recipeYield: "4 servings" });

  it("shows the catalog nutrition threaded in for the primary recipe", () => {
    // 1400 kcal over the four servings → 350 per serving.
    render(
      <CookingMode
        recipe={nutritious()}
        onClose={vi.fn()}
        normalizedNutrition={{
          total: { calories_kcal: 1400 },
          fullyCovered: true,
        }}
      />,
    );
    expect(screen.getByText("350 kcal")).toBeTruthy();
  });

  it("shows no nutrition when the recipe's own stored fields are all it has", () => {
    // The stored blob is not a source: without a normalized total there is
    // nothing to show, and cook mode passes no breakdown link, so the panel
    // disappears rather than rendering its shell.
    render(
      <CookingMode
        recipe={makeRecipe({
          recipeYield: "4 servings",
          nutrition: { calories: "200 kcal" },
        })}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText("200 kcal")).toBeNull();
    expect(screen.queryByText("Nutrition")).toBeNull();
  });
});
