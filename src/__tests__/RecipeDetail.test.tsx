import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import RecipeDetail from "@/components/RecipeDetail";
import type { RecipeRow, HowToStep, HowToSection, SchemaRecipe } from "@/types/recipe";
import { rescrapeFixture } from "@/fixtures/rescrape";

function makeRecipe(schema: Partial<SchemaRecipe> = {}): RecipeRow {
  return {
    id: "1",
    url: "https://example.com",
    source: "example.com",
    status: "draft",
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
    render(<RecipeDetail recipe={makeRecipe({ name: "Spaghetti Bolognese" })} />);
    expect(screen.getByText("Spaghetti Bolognese")).toBeTruthy();
  });

  it("renders description when present", () => {
    render(<RecipeDetail recipe={makeRecipe({ description: "A hearty pasta dish." })} />);
    expect(screen.getByText("A hearty pasta dish.")).toBeTruthy();
  });

  it("renders the author name", () => {
    render(<RecipeDetail recipe={makeRecipe({ author: { name: "Julia Child" } })} />);
    expect(screen.getByText("By Julia Child")).toBeTruthy();
  });

  it("renders category badges", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeCategory: ["Dinner", "Pasta"] })} />);
    expect(screen.getByText("Dinner")).toBeTruthy();
    expect(screen.getByText("Pasta")).toBeTruthy();
  });

  it("renders cuisine badge", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeCuisine: "Italian" })} />);
    expect(screen.getByText("Italian")).toBeTruthy();
  });

  it("renders an image when present", () => {
    render(<RecipeDetail recipe={makeRecipe({ image: "https://example.com/pasta.jpg" })} />);
    expect(screen.getByRole("img")).toBeTruthy();
  });

  it("hides image when absent", () => {
    render(<RecipeDetail recipe={makeRecipe()} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders timing stats when present", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ prepTime: "PT10M", cookTime: "PT30M", totalTime: "PT40M" })}
      />
    );
    expect(screen.getByText("10 min")).toBeTruthy();
    expect(screen.getByText("30 min")).toBeTruthy();
    expect(screen.getByText("40 min")).toBeTruthy();
  });

  it("renders servings stepper from array yield (first element)", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeYield: ["4 servings", "8 pieces"] })} />);
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByRole("button", { name: /increase servings/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /decrease servings/i })).toBeTruthy();
  });

  it("renders servings stepper from string yield", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeYield: "6 servings" })} />);
    expect(screen.getByText("6")).toBeTruthy();
    expect(screen.getByRole("button", { name: /increase servings/i })).toBeTruthy();
  });

  it("renders flat HowToStep instructions as a numbered list", () => {
    const steps: HowToStep[] = [
      { "@type": "HowToStep", text: "Boil water." },
      { "@type": "HowToStep", text: "Add pasta." },
    ];
    render(<RecipeDetail recipe={makeRecipe({ recipeInstructions: steps })} />);
    expect(screen.getByText("Boil water.")).toBeTruthy();
    expect(screen.getByText("Add pasta.")).toBeTruthy();
  });

  it("renders HowToSection instructions with section headers", () => {
    const sections: HowToSection[] = [
      {
        "@type": "HowToSection",
        name: "For the sauce",
        itemListElement: [{ text: "Simmer tomatoes." }],
      },
      {
        "@type": "HowToSection",
        name: "For the pasta",
        itemListElement: [{ text: "Boil salted water." }],
      },
    ];
    render(<RecipeDetail recipe={makeRecipe({ recipeInstructions: sections })} />);
    expect(screen.getByText("For the sauce")).toBeTruthy();
    expect(screen.getByText("Simmer tomatoes.")).toBeTruthy();
    expect(screen.getByText("For the pasta")).toBeTruthy();
    expect(screen.getByText("Boil salted water.")).toBeTruthy();
  });

  it("shows nutrition section when at least one nutrient field is present", () => {
    render(
      <RecipeDetail recipe={makeRecipe({ nutrition: { calories: "350 kcal" } })} />
    );
    expect(screen.getByText("Nutrition")).toBeTruthy();
    expect(screen.getByText("350 kcal")).toBeTruthy();
  });

  it("shows all present nutrition fields", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({
          nutrition: {
            calories: "350 kcal",
            proteinContent: "20g",
            carbohydrateContent: "40g",
            fatContent: "10g",
          },
        })}
      />
    );
    expect(screen.getByText("350 kcal")).toBeTruthy();
    expect(screen.getByText("20g")).toBeTruthy();
    expect(screen.getByText("40g")).toBeTruthy();
    expect(screen.getByText("10g")).toBeTruthy();
  });

  it("hides nutrition section when only non-counted fields are present (e.g. servingSize)", () => {
    render(
      <RecipeDetail recipe={makeRecipe({ nutrition: { servingSize: "1 cup" } })} />
    );
    expect(screen.queryByText("Nutrition")).toBeNull();
  });

  it("hides nutrition section when nutrition is absent", () => {
    render(<RecipeDetail recipe={makeRecipe()} />);
    expect(screen.queryByText("Nutrition")).toBeNull();
  });

  it("renders ingredients list", () => {
    const { container } = render(
      <RecipeDetail
        recipe={makeRecipe({ recipeIngredient: ["2 cups flour", "1 cup sugar"] })}
      />
    );
    // Convertable ingredients are split into amount + unit select + rest
    expect(container.textContent).toContain("flour");
    expect(container.textContent).toContain("sugar");
  });

  it("renders ingredients grouped by group with headings", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({
          recipeIngredient: [
            { name: "2 cups flour", group: "Cake" },
            { name: "1 cup milk", group: "Cake" },
            { name: "1 tsp vanilla", group: "Frosting" },
          ],
        })}
      />
    );
    expect(screen.getByText("Cake")).toBeTruthy();
    expect(screen.getByText("Frosting")).toBeTruthy();
  });

  it("renders ungrouped ingredients without section headings", () => {
    render(
      <RecipeDetail
        recipe={makeRecipe({ recipeIngredient: ["2 cups flour", "1 cup sugar"] })}
      />
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
    render(<RecipeDetail recipe={makeRecipe({ recipeIngredient: ["2 cups flour", "1 tsp salt"] })} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0].getAttribute("aria-checked")).toBe("false");
    expect(boxes[1].getAttribute("aria-checked")).toBe("false");
  });

  it("clicking an ingredient checks it", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeIngredient: ["2 cups flour"] })} />);
    const box = screen.getByRole("checkbox", { name: "2 cups flour" });
    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("true");
  });

  it("clicking a checked ingredient unchecks it", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeIngredient: ["2 cups flour"] })} />);
    const box = screen.getByRole("checkbox", { name: "2 cups flour" });
    fireEvent.click(box);
    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("false");
  });

  it("copy button is disabled when nothing is selected", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeIngredient: ["2 cups flour"] })} />);
    expect(screen.getByRole("button", { name: /copy shopping list/i })).toBeDisabled();
  });

  it("copy button becomes enabled when an ingredient is selected", () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeIngredient: ["2 cups flour"] })} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    expect(screen.getByRole("button", { name: /copy shopping list/i })).not.toBeDisabled();
  });

  it("clicking copy writes selected ingredients to clipboard", async () => {
    render(<RecipeDetail recipe={makeRecipe({ recipeIngredient: ["2 cups flour", "1 tsp salt"] })} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "1 tsp salt" }));
    fireEvent.click(screen.getByRole("button", { name: /copy shopping list/i }));
    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("2 cups flour\n1 tsp salt");
    });
  });
});

describe("RecipeDetail — controls section", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the Manage section when isLoggedIn is false", () => {
    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={false} />);
    expect(screen.queryByRole("region", { name: /recipe management/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /re-scrape/i })).toBeNull();
  });

  it("shows the Re-scrape button when isLoggedIn is true", () => {
    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    expect(screen.getByRole("button", { name: /re-scrape/i })).toBeTruthy();
  });

  it("shows loading state while re-scraping", async () => {
    let resolve: (value: Response) => void;
    const pending = new Promise<Response>((res) => { resolve = res; });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));

    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /re-scrape/i }));
    });

    expect(screen.getByRole("button", { name: /re-scraping/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /re-scraping/i })).toBeDisabled();

    resolve!(new Response(JSON.stringify({ schema: rescrapeFixture }), { status: 200 }));
  });

  it("enters edit mode with rescraped data after a successful re-scrape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ schema: rescrapeFixture }), { status: 200 })
      )
    );

    render(<RecipeDetail recipe={makeRecipe({ name: "Old Recipe Name" })} isLoggedIn={true} />);
    expect(screen.getByText("Old Recipe Name")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /re-scrape/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^confirm$/i })).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy();
    expect(screen.getByText(/reviewing re-scraped data/i)).toBeTruthy();
    expect(screen.getByText(rescrapeFixture.name)).toBeTruthy();
  });

  it("reverts to original schema when rescrape review is cancelled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ schema: rescrapeFixture }), { status: 200 })
      )
    );

    render(<RecipeDetail recipe={makeRecipe({ name: "Original Name" })} isLoggedIn={true} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /re-scrape/i }));
    });
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
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ schema: rescrapeFixture }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ schema: rescrapeFixture, status: "draft" }), { status: 200 })
      );
    vi.stubGlobal("fetch", mockFetch);

    render(<RecipeDetail recipe={makeRecipe({ name: "Old" })} isLoggedIn={true} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /re-scrape/i }));
    });
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
      vi.fn().mockResolvedValue(new Response(null, { status: 502 }))
    );

    render(<RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /re-scrape/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/re-scrape failed/i)).toBeTruthy();
    });
  });

  it("does not crash when rescrape response is missing schema key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      )
    );

    render(<RecipeDetail recipe={makeRecipe({ name: "My Recipe" })} isLoggedIn={true} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /re-scrape/i }));
    });

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
        new Response(JSON.stringify({ status: "published" }), { status: 200 })
      )
    );

    render(<RecipeDetail recipe={makeRecipe({ name: "My Recipe" })} isLoggedIn={true} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/save failed/i)).toBeTruthy();
    });
    expect(screen.getByText("My Recipe")).toBeTruthy();
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
        recipe={makeRecipe({ description: "Tasty.", notes: "Use fresh herbs." })}
        isLoggedIn={true}
      />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /recipe status/i })).toBeTruthy();
  });

  it("populates description textarea with current value in edit mode", async () => {
    render(
      <RecipeDetail recipe={makeRecipe({ description: "A hearty dish." })} isLoggedIn={true} />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    const textarea = screen.getByPlaceholderText(/description/i) as HTMLTextAreaElement;
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
    render(<RecipeDetail recipe={makeRecipe({ description: "Original." })} isLoggedIn={true} />);
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
    const updatedSchema = { ...rescrapeFixture, description: "Updated description." };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ schema: updatedSchema, status: "published" }), { status: 200 })
      )
    );

    render(<RecipeDetail recipe={makeRecipe({ name: "Old Name" })} isLoggedIn={true} />);
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
      vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
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
    render(
      <RecipeDetail recipe={makeRecipe()} isLoggedIn={true} />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    });
    const input = screen.getByPlaceholderText(/https:\/\/example\.com\/recipe/i) as HTMLInputElement;
    expect(input.value).toBe("https://example.com");
  });

  it("includes url in the save request body", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ schema: rescrapeFixture, status: "draft" }), { status: 200 })
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
});
