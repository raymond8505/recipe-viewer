import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CookingMode from "@/components/CookingMode";
import type { RecipeRow, SchemaRecipe } from "@/types/recipe";
import { makeRecipeRow } from "@/fixtures";

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

// Thin local default over the shared factory (src/fixtures/recipes.ts), which
// splits a schema into the columns + recipe_ingredients rows the component
// reads. Never hand-build a RecipeRow here — see .claude/docs/fixtures.md.
function makeRecipe(schema: Partial<SchemaRecipe> = {}): RecipeRow {
  return makeRecipeRow({
    id: "1",
    url: "https://example.com",
    source: "example.com",
    schema: { name: "Test Recipe", ...schema },
  });
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
    // RTL's waitFor (not vi.waitFor): it suspends the act environment while
    // polling, so the post-clipboard "copied" state update doesn't warn.
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("2 cups flour\n1 tsp salt");
    });
  });

  it("copies scaled amounts after the recipe is scaled", async () => {
    const recipe = makeRecipe({
      recipeYield: "1 serving",
      recipeIngredient: ["2 cups flour", "1 tsp salt"],
    });
    render(<CookingMode recipe={recipe} onClose={vi.fn()} />);
    // Selection is keyed by the raw text, so it survives the scale change.
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
    const secondary = makeRecipe({
      name: "Side Salad",
      recipeIngredient: ["1 cup rice"],
    });
    secondary.id = "2";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ data: [secondary] }) }),
    );
    const recipe = makeRecipe({
      recipeYield: "1 serving",
      recipeIngredient: ["2 cups flour"],
    });
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

describe("CookingMode — nutrition source badge", () => {
  const nutritious = () =>
    makeRecipe({
      nutrition: { calories: "200 kcal" },
      cookingNotes: "less salt next time",
    });
  // The badge's title is the stable hook — its visible text ("recipe") is a
  // common word that collides elsewhere in the modal.
  const BADGE_TITLE = /from the recipe's own nutrition data/i;

  it("hides the badge from an anonymous viewer", () => {
    render(<CookingMode recipe={nutritious()} onClose={vi.fn()} />);
    expect(screen.queryByTitle(BADGE_TITLE)).toBeNull();
  });

  it("shows the badge when logged in", () => {
    render(<CookingMode recipe={nutritious()} onClose={vi.fn()} isLoggedIn />);
    expect(screen.getAllByTitle(BADGE_TITLE).length).toBeGreaterThanOrEqual(1);
  });

  // The dev-door contract in cook mode: nutrition provenance opens for a
  // logged-out viewer, cooking notes stay shut.
  it("shows the badge but not cooking notes when canCurateNutrition without a login", () => {
    render(
      <CookingMode
        recipe={nutritious()}
        onClose={vi.fn()}
        isLoggedIn={false}
        canCurateNutrition
      />,
    );
    expect(screen.getAllByTitle(BADGE_TITLE).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByPlaceholderText(/note changes for next time/i)).toBeNull();
  });
});
