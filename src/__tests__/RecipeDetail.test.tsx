import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import RecipeDetail from "@/components/RecipeDetail";
import type {
  RecipeRow,
  RecipeIngredientGroup,
  SchemaRecipe,
} from "@/types/recipe";
import {
  rescrapeFixture,
  rescrapeResponseFixture,
  rescrapeSavedFixture,
} from "@/fixtures/rescrape";
import {
  makeIngredientGroup,
  makeIngredientLines,
  makeInstructionGroup,
  makeSteps,
} from "@/fixtures";
import { clickAndConfirm } from "./helpers/confirmBar";

function makeRecipe(
  schema: Partial<SchemaRecipe> = {},
  row: Partial<Omit<RecipeRow, "metadata">> = {},
  ingredients: string[] | RecipeIngredientGroup[] = [],
): RecipeRow {
  return {
    id: "1",
    url: "https://example.com",
    source: "example.com",
    status: "draft",
    ingredients:
      typeof ingredients[0] === "string"
        ? makeIngredientLines(ingredients as string[])
        : (ingredients as RecipeIngredientGroup[]),
    instructions: [],
    ...row,
    metadata: {
      schema: {
        name: "Test Recipe",
        ...schema,
      },
    },
  };
}

describe("RecipeDetail", () => {
  it("renders the recipe name", () => {
    render(
      <RecipeDetail recipe={makeRecipe({ name: "Spaghetti Bolognese" })} />,
    );
    expect(screen.getByText("Spaghetti Bolognese")).toBeTruthy();
  });

  it("renders description when present", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ description: "A hearty pasta dish." })}
      />,
    );
    expect(screen.getByText("A hearty pasta dish.")).toBeTruthy();
  });

  it("renders category badges", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ recipeCategory: ["Dinner", "Pasta"] })}
      />,
    );
    expect(screen.getByText("Dinner")).toBeTruthy();
    expect(screen.getByText("Pasta")).toBeTruthy();
  });

  it("renders cuisine badge", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeCuisine: "Italian" })} />);
    expect(screen.getByText("Italian")).toBeTruthy();
  });

  it("renders an image when present", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ image: "https://example.com/pasta.jpg" })}
      />,
    );
    expect(screen.getByRole("img")).toBeTruthy();
  });

  it("hides image when absent", () => {
    render(<RecipeDetail recipe={makeRecipe()} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders timing stats when present", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({
          prepTime: "PT10M",
          cookTime: "PT30M",
          totalTime: "PT40M",
        })}
      />,
    );
    expect(screen.getByText("10 min")).toBeTruthy();
    expect(screen.getByText("30 min")).toBeTruthy();
    expect(screen.getByText("40 min")).toBeTruthy();
  });

  it("renders servings stepper from array yield (first element)", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ recipeYield: ["4 servings", "8 pieces"] })}
      />,
    );
    expect(screen.getByText("4")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /increase servings/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /decrease servings/i }),
    ).toBeTruthy();
  });

  it("renders servings stepper from string yield", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeYield: "6 servings" })} />);
    expect(screen.getByText("6")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /increase servings/i }),
    ).toBeTruthy();
  });

  it("renders a nameless run of steps as a numbered list", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, { instructions: makeSteps(["Boil water.", "Add pasta."]) })}
      />,
    );
    expect(screen.getByText("Boil water.")).toBeTruthy();
    expect(screen.getByText("Add pasta.")).toBeTruthy();
  });

  it("renders named groups with their headings, and a nameless run beside them", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe(
          {},
          {
            instructions: [
              makeInstructionGroup(undefined, ["Preheat the oven."]),
              makeInstructionGroup("For the sauce", ["Simmer tomatoes."]),
              makeInstructionGroup("For the pasta", ["Boil salted water."]),
            ],
          },
        )}
      />,
    );
    expect(screen.getByText("Preheat the oven.")).toBeTruthy();
    expect(screen.getByText("For the sauce")).toBeTruthy();
    expect(screen.getByText("Simmer tomatoes.")).toBeTruthy();
    expect(screen.getByText("For the pasta")).toBeTruthy();
    expect(screen.getByText("Boil salted water.")).toBeTruthy();
  });

  it("hides the instructions section when every group is empty", () => {
    render(<RecipeDetail recipe={makeRecipe({}, { instructions: [{ steps: [] }] })} />);
    expect(screen.queryByText("Instructions")).toBeNull();
  });

  // The nutrition the page shows comes from the catalog total the server
  // resolved, never from the recipe's own stored fields. Totals are
  // whole-recipe and the yield below is four servings, so they read as ÷4.
  it("shows the nutrition section from the normalized catalog total", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ recipeYield: "4 servings" })}
        normalizedNutrition={{
          total: { calories_kcal: 1400 },
          fullyCovered: true,
        }}
      />,
    );
    expect(screen.getByText("Nutrition")).toBeTruthy();
    expect(screen.getByText("350 kcal")).toBeTruthy();
  });

  it("shows all present nutrition fields", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ recipeYield: "4 servings" })}
        normalizedNutrition={{
          total: {
            calories_kcal: 1400,
            protein_g: 80,
            carbs_g: 160,
            fat_g: 40,
          },
          fullyCovered: true,
        }}
      />,
    );
    expect(screen.getByText("350 kcal")).toBeTruthy();
    // Units are re-attached from the parsed NutrientValue, so they render spaced.
    expect(screen.getByText("20 g")).toBeTruthy();
    expect(screen.getByText("40 g")).toBeTruthy();
    expect(screen.getByText("10 g")).toBeTruthy();
  });

  it("hides the nutrition section when the total covers no countable nutrient", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({
          recipeYield: "4 servings",
          nutrition: { servingSize: "1 cup" },
        })}
        normalizedNutrition={{ total: {}, fullyCovered: true }}
      />,
    );
    expect(screen.queryByText("Nutrition")).toBeNull();
  });

  it("hides the nutrition section when the recipe was never normalized", () => {
    render(<RecipeDetail recipe={makeRecipe()} />);
    expect(screen.queryByText("Nutrition")).toBeNull();
  });

  it("hides the nutrition section even when the recipe has its own stored fields", () => {
    // The catalog is the only source, so a recipe nobody has normalized shows
    // nothing regardless of how complete its stored fields are.
    render(
      <RecipeDetail
        recipe={makeRecipe({
          recipeYield: "4 servings",
          nutrition: { calories: "350 kcal", proteinContent: "20 g" },
        })}
      />,
    );
    expect(screen.queryByText("Nutrition")).toBeNull();
    expect(screen.queryByText("350 kcal")).toBeNull();
  });

  it("renders ingredients list", () => {
    const { container } = render(
      <RecipeDetail
        recipe={makeRecipe({}, {}, ["2 cups flour", "1 cup sugar"])}
      />,
    );
    // Convertable ingredients are split into amount + unit select + rest
    expect(container.textContent).toContain("flour");
    expect(container.textContent).toContain("sugar");
  });

  it("renders ingredients grouped by group with headings", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, {}, [
          makeIngredientGroup("Cake", ["2 cups flour", "1 cup milk"]),
          makeIngredientGroup("Frosting", ["1 tsp vanilla"]),
        ])}
      />,
    );
    expect(screen.getByText("Cake")).toBeTruthy();
    expect(screen.getByText("Frosting")).toBeTruthy();
  });

  it("renders ungrouped ingredients without section headings", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, {}, ["2 cups flour", "1 cup sugar"])}
      />,
    );
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });
});

describe("RecipeDetail — shopping list", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("ingredient rows render as unchecked checkboxes", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, {}, ["2 cups flour", "1 tsp salt"])}
      />,
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0].getAttribute("aria-checked")).toBe("false");
    expect(boxes[1].getAttribute("aria-checked")).toBe("false");
  });

  it("clicking an ingredient checks it", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, {}, ["2 cups flour"])}
      />,
    );
    const box = screen.getByRole("checkbox", { name: "2 cups flour" });
    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("true");
  });

  it("clicking a checked ingredient unchecks it", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, {}, ["2 cups flour"])}
      />,
    );
    const box = screen.getByRole("checkbox", { name: "2 cups flour" });
    fireEvent.click(box);
    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("false");
  });

  it("copy button is disabled when nothing is selected", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, {}, ["2 cups flour"])}
      />,
    );
    expect(
      screen.getByRole("button", { name: /copy shopping list/i }),
    ).toBeDisabled();
  });

  it("copy button becomes enabled when an ingredient is selected", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, {}, ["2 cups flour"])}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    expect(
      screen.getByRole("button", { name: /copy shopping list/i }),
    ).not.toBeDisabled();
  });

  it("clicking copy writes selected ingredients to clipboard", async () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, {}, ["2 cups flour", "1 tsp salt"])}
      />,
    );
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
    render(
      <RecipeDetail
        recipe={makeRecipe({ recipeYield: "1 serving" }, {}, ["2 cups flour", "1 tsp salt"])}
      />,
    );
    // Selection is keyed by the line's id, so it survives the scale change.
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "1 tsp salt" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase servings" }));
    fireEvent.click(screen.getByRole("button", { name: /copy shopping list/i }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("4 cups flour\n2 tsp salt");
    });
  });

  it("clears the copy-feedback reset timer on unmount", async () => {
    const setSpy = vi.spyOn(globalThis, "setTimeout");
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = render(
      <RecipeDetail
        recipe={makeRecipe({}, {}, ["2 cups flour"])}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));

    // The handler schedules the 2s feedback-reset timer in an async continuation
    // (after the awaited clipboard write) — flush it inside act, then wait for it.
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /copy shopping list/i }),
      );
      await vi.waitFor(() =>
        expect(setSpy.mock.calls.some(([, delay]) => delay === 2000)).toBe(
          true,
        ),
      );
    });
    const idx = setSpy.mock.calls.findIndex(([, delay]) => delay === 2000);
    const timerId = setSpy.mock.results[idx].value;

    // Unmounting must clear that exact timer, or it fires after teardown and
    // calls setState on an unmounted component ("window is not defined").
    unmount();
    expect(clearSpy).toHaveBeenCalledWith(timerId);

    setSpy.mockRestore();
    clearSpy.mockRestore();
  });
});

describe("RecipeDetail — controls section", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the Manage section when isLoggedIn is false", () => {
    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={false} />);
    expect(
      screen.queryByRole("region", { name: /recipe management/i }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /re-scrape/i })).toBeNull();
  });

  it("shows the Re-scrape button when isLoggedIn is true", () => {
    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    expect(screen.getByRole("button", { name: /re-scrape/i })).toBeTruthy();
  });

  // Re-scrape needs BOTH halves to be pointless before it switches off: the
  // recipe is the user's own AND its source URL is this very page, so a
  // re-scrape would fetch the page already on screen. It disables rather than
  // disappearing, so the reason is visible instead of the button silently
  // going missing.
  it("disables Re-scrape for an own recipe whose source URL is this page", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, { source: "custom", url: window.location.href })}
        isLoggedIn={true}
      />,
    );

    const button = screen.getByRole("button", { name: /re-scrape/i });
    expect(button).toBeDisabled();
    // The reason rides on the accessible name too: the tooltip is hover-only
    // and a disabled button can't take focus.
    expect(button).toHaveAccessibleName(/nothing external to re-fetch/i);
    // The rest of the Manage toolbar is unaffected.
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeEnabled();
  });

  // Each half alone leaves Re-scrape usable.
  it("keeps Re-scrape enabled when the url matches but the recipe is not the user's own", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, { url: window.location.href })}
        isLoggedIn={true}
      />,
    );
    expect(screen.getByRole("button", { name: /re-scrape/i })).toBeEnabled();
  });

  it("keeps Re-scrape enabled for an own recipe that still points at an external page", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe(
          {},
          { source: "custom", url: "https://seriouseats.com/kebab" },
        )}
        isLoggedIn={true}
      />,
    );
    expect(screen.getByRole("button", { name: /re-scrape/i })).toBeEnabled();
  });

  it("links to the nutrition breakdown only when logged in", () => {
    const { unmount } = render(
      <RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />,
    );
    expect(
      screen.getByRole("link", { name: "Ingredient breakdown" }),
    ).toHaveAttribute("href", "/recipes/1/ingredients");
    unmount();

    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={false} />);
    expect(screen.queryByRole("link", { name: "Ingredient breakdown" })).toBeNull();
  });

  // The whole contract of the dev-only nutrition door in one case: the nutrition
  // layer opens for a logged-out viewer, and the edit surface does NOT come with
  // it. The server page passes canCurateNutrition (resolved from NODE_ENV) — this
  // component just honours it, so no env stubbing is needed here.
  it("opens nutrition — but not editing — when canCurateNutrition without a login", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe()}
        isLoggedIn={false}
        canCurateNutrition={true}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Ingredient breakdown" }),
    ).toHaveAttribute("href", "/recipes/1/ingredients");
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /re-scrape/i })).toBeNull();
  });

  it("defaults canCurateNutrition to isLoggedIn — curation is never wider than login by accident", () => {
    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    expect(
      screen.getByRole("link", { name: "Ingredient breakdown" }),
    ).toHaveAttribute("href", "/recipes/1/ingredients");
  });

  // Each of these fires a webhook or queues a model run the moment it is
  // invoked, so a misclick is unrecoverable spend. Re-scrape and regen-image
  // do have an after-the-fact review to back out of, but by then the external
  // call has already been paid for; Normalize has no undo at all — nothing may
  // reach the network until the second, deliberate click.
  // `/^normalize$/i` is anchored so it doesn't also match "Normalizing…".
  const EXPENSIVE_ACTIONS: [string, RegExp, RegExp][] = [
    ["Re-scrape", /re-scrape/i, /re-fetches and re-parses the source page/i],
    ["Regen Image", /regen image/i, /replaces the current image/i],
    ["Normalize", /^normalize$/i, /re-parses every ingredient line/i],
  ];

  it.each(EXPENSIVE_ACTIONS)(
    "%s asks for confirmation before spending anything",
    async (_label, button, message) => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: button }));
      });

      expect(screen.getByText(message)).toBeTruthy();
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it.each(EXPENSIVE_ACTIONS)(
    "%s stays unspent when the confirm is cancelled",
    async (_label, button) => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: button }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
      });

      // The whole toolbar comes back, not just the trigger that was clicked.
      expect(screen.getByRole("button", { name: button })).toBeTruthy();
      expect(screen.getByRole("button", { name: /^edit$/i })).toBeTruthy();
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it("queues normalization once the confirm is accepted", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    await clickAndConfirm(/^normalize$/i);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(String(mockFetch.mock.calls[0][0])).toContain("/normalize");
  });

  it("shows loading state while re-scraping", async () => {
    let resolve: (value: Response) => void;
    const pending = new Promise<Response>((res) => {
      resolve = res;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));

    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    await clickAndConfirm(/re-scrape/i);

    expect(screen.getByRole("button", { name: /re-scraping/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /re-scraping/i })).toBeDisabled();

    // Flush the response continuation (json parse + state updates) inside act
    // so the post-resolve setState doesn't fire after the test as a warning.
    await act(async () => {
      resolve!(new Response(JSON.stringify(rescrapeResponseFixture), { status: 200 }));
    });
  });

  it("enters edit mode with rescraped data after a successful re-scrape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(rescrapeResponseFixture), {
          status: 200,
        }),
      ),
    );

    render(
      <RecipeDetail
        recipe={makeRecipe({ name: "Old Recipe Name" })}
        isLoggedIn={true}
      />,
    );
    expect(screen.getByText("Old Recipe Name")).toBeTruthy();

    await clickAndConfirm(/re-scrape/i);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^confirm$/i })).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy();
    expect(screen.getByText(/reviewing re-scraped data/i)).toBeTruthy();
    expect(
      (
        screen.getByRole("textbox", {
          name: /recipe title/i,
        }) as HTMLInputElement
      ).value,
    ).toBe(rescrapeFixture.name);
  });

  it("reverts to original schema when rescrape review is cancelled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(rescrapeResponseFixture), {
          status: 200,
        }),
      ),
    );

    render(
      <RecipeDetail
        recipe={makeRecipe({ name: "Original Name" })}
        isLoggedIn={true}
      />,
    );
    await clickAndConfirm(/re-scrape/i);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^confirm$/i })).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    });

    expect(screen.getByText("Original Name")).toBeTruthy();
    expect(screen.queryByText(rescrapeFixture.name)).toBeNull();
    expect(screen.queryByText(/reviewing re-scraped data/i)).toBeNull();
  });

  it("sends rescraped data to update endpoint when confirmed", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(rescrapeResponseFixture), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...rescrapeSavedFixture, status: "draft" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    render(
      <RecipeDetail recipe={makeRecipe({ name: "Old" })} isLoggedIn={true} />,
    );
    await clickAndConfirm(/re-scrape/i);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^confirm$/i })).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch.mock.calls[1][0]).toContain("/update");
  });

  it("shows error message when re-scrape fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 502 })),
    );

    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    await clickAndConfirm(/re-scrape/i);

    await waitFor(() => {
      expect(screen.getByText(/re-scrape failed/i)).toBeTruthy();
    });
  });

  it("does not crash when rescrape response is missing schema key", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );

    render(
      <RecipeDetail
        recipe={makeRecipe({ name: "My Recipe" })}
        isLoggedIn={true}
      />,
    );
    await clickAndConfirm(/re-scrape/i);

    await waitFor(() => {
      expect(screen.getByText(/re-scrape failed/i)).toBeTruthy();
    });
    // recipe name must still be in the DOM — schema must not have been set to undefined
    expect(screen.getByText("My Recipe")).toBeTruthy();
  });

  it("does not crash when save response is missing schema key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "published" }), {
          status: 200,
        }),
      ),
    );

    render(
      <RecipeDetail
        recipe={makeRecipe({ name: "My Recipe" })}
        isLoggedIn={true}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/save failed/i)).toBeTruthy();
    });
    expect(
      (
        screen.getByRole("textbox", {
          name: /recipe title/i,
        }) as HTMLInputElement
      ).value,
    ).toBe("My Recipe");
  });

  it("shows Edit button when logged in", () => {
    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeTruthy();
  });

  it("does not show Edit button when logged out", () => {
    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={false} />);
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
  });

  it("does not show Delete button", () => {
    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    expect(screen.queryByRole("button", { name: /^delete$/i })).toBeNull();
  });

  it("enters edit mode when Edit is clicked", async () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({
          description: "Tasty.",
          notes: "Use fresh herbs.",
        })}
        isLoggedIn={true}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: /recipe status/i }),
    ).toBeTruthy();
  });

  it("populates description textarea with current value in edit mode", async () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ description: "A hearty dish." })}
        isLoggedIn={true}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    const textarea = screen.getByPlaceholderText(
      /description/i,
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("A hearty dish.");
  });

  it("shows notes textarea in edit mode even when schema has no notes", async () => {
    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    expect(screen.queryByText("Notes")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    expect(screen.getByText("Notes")).toBeTruthy();
    expect(screen.getByPlaceholderText(/add notes/i)).toBeTruthy();
  });

  it("cancel returns to view mode without saving", async () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ description: "Original." })}
        isLoggedIn={true}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    });
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
  });

  it("updates recipe state after a successful save", async () => {
    const updatedSchema = {
      ...rescrapeResponseFixture.schema,
      description: "Updated description.",
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              schema: updatedSchema,
              ingredients: [],
              instructions: [],
              status: "published",
            }),
            { status: 200 },
          ),
        ),
    );

    render(
      <RecipeDetail
        recipe={makeRecipe({ name: "Old Name" })}
        isLoggedIn={true}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(updatedSchema.name)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeTruthy();
  });

  it("shows error message when save fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/save failed/i)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
  });

  it("shows Source URL input pre-filled with recipe.url in edit mode", async () => {
    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    const input = screen.getByPlaceholderText(
      /https:\/\/example\.com\/recipe/i,
    ) as HTMLInputElement;
    expect(input.value).toBe("https://example.com");
  });

  // Both provenance fields sit in a "Source" fieldset, so each label is only
  // the part that differs: URL and Name.
  it("shows Source input pre-filled with recipe.source in edit mode", async () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, { source: "seriouseats.com" })}
        isLoggedIn={true}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "seriouseats.com",
    );
  });

  it("includes the edited source in the save request body", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ...rescrapeSavedFixture,
            status: "draft",
            source: "custom",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Name"), {
        target: { value: "custom" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).source).toBe("custom");
  });

  // The whole point of making source editable: switching a recipe to "custom"
  // must retire Re-scrape straight away. The `recipe` prop is a server-render
  // snapshot that never changes, so this only works because RecipeDetail tracks
  // source in state and re-seeds it from the save response. The url is pinned
  // to this page so the other half of the check is already satisfied and the
  // source edit is the only thing moving.
  it("disables the Re-scrape button after saving source as custom", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ...rescrapeSavedFixture,
            status: "draft",
            source: "custom",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    render(
      <RecipeDetail
        recipe={makeRecipe({}, { url: window.location.href })}
        isLoggedIn={true}
      />,
    );
    expect(screen.getByRole("button", { name: /re-scrape/i })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Name"), {
        target: { value: "custom" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /re-scrape/i })).toBeDisabled(),
    );
  });

  // Regression: the editor used to seed its URL draft from the `recipe` prop
  // while status and source came from state. The prop is a server-render
  // snapshot, so a saved URL edit reverted the moment the editor was reopened —
  // and only a page refresh made the new value stick.
  it("keeps the edited source URL when the editor is reopened after saving", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...rescrapeSavedFixture,
          status: "draft",
          url: "https://corrected.com/recipe",
          source: "example.com",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.change(
        screen.getByPlaceholderText(/https:\/\/example\.com\/recipe/i),
        { target: { value: "https://corrected.com/recipe" } },
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    expect(
      (
        screen.getByPlaceholderText(
          /https:\/\/example\.com\/recipe/i,
        ) as HTMLInputElement
      ).value,
    ).toBe("https://corrected.com/recipe");
  });

  // The other half of the same staleness: isSelfReferential compares the URL to
  // the current location, so pointing an own-recipe at a real external page has
  // to bring Re-scrape back without waiting for a refresh.
  it("re-enables the Re-scrape button after saving a URL away from this page", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...rescrapeSavedFixture,
          status: "draft",
          url: "https://seriouseats.com/kebab",
          source: "custom",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    render(
      <RecipeDetail
        recipe={makeRecipe({}, { source: "custom", url: window.location.href })}
        isLoggedIn={true}
      />,
    );
    expect(screen.getByRole("button", { name: /re-scrape/i })).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.change(
        screen.getByPlaceholderText(/https:\/\/example\.com\/recipe/i),
        { target: { value: "https://seriouseats.com/kebab" } },
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /re-scrape/i })).toBeEnabled(),
    );
  });

  // The shortcut exists because "custom" is a magic word with behaviour behind
  // it (isOwnRecipe), so marking a recipe as your own shouldn't depend on
  // spelling it correctly.
  it("fills the source field with custom from the shortcut button", async () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, { source: "seriouseats.com" })}
        isLoggedIn={true}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /set source to "custom"/i }),
      );
    });

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "custom",
    );
  });

  // Disabled-once-matched doubles as the "already your own recipe" indicator,
  // so the field group needs no separate badge for that state.
  it("disables the custom shortcut once the source already is custom", async () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, { source: "custom" })}
        isLoggedIn={true}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });

    expect(
      screen.getByRole("button", { name: /source is already "custom"/i }),
    ).toBeDisabled();
  });

  it("offers an open-in-new-tab link for the source URL", async () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({}, { url: "https://seriouseats.com/kebab" })}
        isLoggedIn={true}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });

    const link = screen.getByRole("link", {
      name: /open source url in a new tab/i,
    });
    expect(link).toHaveAttribute("href", "https://seriouseats.com/kebab");
    expect(link).toHaveAttribute("target", "_blank");
    // Opening an arbitrary user-supplied URL without this hands the new tab a
    // window.opener handle back to the app.
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  // A half-typed value must not be a live link. Dropping the href makes the
  // anchor inert (not focusable, not a link) without unmounting it, so the
  // input keeps its width as the user types.
  it("keeps the open link inert while the source URL is incomplete", async () => {
    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("URL"), {
        target: { value: "htt" },
      });
    });

    expect(
      screen.queryByRole("link", { name: /open source url in a new tab/i }),
    ).toBeNull();
  });

  it("includes url in the save request body", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ...rescrapeSavedFixture, status: "draft" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.url).toBe("https://example.com");
  });

  it("shows title input pre-filled with current name in edit mode", async () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ name: "Original Title" })}
        isLoggedIn={true}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    const input = screen.getByRole("textbox", {
      name: /recipe title/i,
    }) as HTMLInputElement;
    expect(input.value).toBe("Original Title");
  });

  it("includes the edited name in the save request body", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ...rescrapeSavedFixture, status: "draft" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    render(
      <RecipeDetail
        recipe={makeRecipe({ name: "Old Title" })}
        isLoggedIn={true}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: /recipe title/i }), {
        target: { value: "New Title" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.schema.name).toBe("New Title");
  });

  it("shows a servings input pre-filled with the base servings in edit mode", async () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ recipeYield: "4 servings" })}
        isLoggedIn={true}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    const input = screen.getByRole("textbox", {
      name: /^servings$/i,
    }) as HTMLInputElement;
    expect(input.value).toBe("4");
  });

  it("includes the edited base servings in the save request body", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ...rescrapeSavedFixture, status: "draft" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    render(
      <RecipeDetail
        recipe={makeRecipe({ recipeYield: "4 servings" })}
        isLoggedIn={true}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: /^servings$/i }), {
        target: { value: "8" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.schema.recipeYield).toBe("8 servings");
  });
});
