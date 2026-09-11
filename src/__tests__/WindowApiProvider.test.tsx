import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import WindowApiProvider from "@/components/WindowApiProvider";
import { notifyRecipeUpdate, registerCookingModeRecipe, unregisterCookingModeRecipe } from "@/lib/windowApi";
import { makeIngredientLines, makeInstructionGroup, makeStep, makeSteps } from "@/fixtures";
import type { RecipeDocument } from "@/types/recipe";
import { useRouter } from "next/navigation";

afterEach(() => {
  cleanup();
  unregisterCookingModeRecipe();
  delete (window as Partial<Window>).recipeTools;
  delete (window as Partial<Window>).__agentApis__;
});

describe("WindowApiProvider", () => {
  it("attaches window.recipeTools on mount", () => {
    render(<WindowApiProvider />);
    expect(window.recipeTools).toBeDefined();
  });

  it("ping returns 'success'", () => {
    render(<WindowApiProvider />);
    expect(window.recipeTools.ping()).toBe("success");
  });

  it("removes window.recipeTools on unmount", () => {
    const { unmount } = render(<WindowApiProvider />);
    unmount();
    expect((window as Partial<Window>).recipeTools).toBeUndefined();
  });

  describe("agent discovery comment", () => {
    it("inserts a comment node into document.body on mount", () => {
      render(<WindowApiProvider />);
      const comments = Array.from(document.body.childNodes).filter(
        (n) => n.nodeType === Node.COMMENT_NODE
      );
      expect(comments.some((n) => n.textContent?.includes("recipeTools"))).toBe(true);
    });

    it("removes the comment node on unmount", () => {
      const { unmount } = render(<WindowApiProvider />);
      unmount();
      const comments = Array.from(document.body.childNodes).filter(
        (n) => n.nodeType === Node.COMMENT_NODE
      );
      expect(comments.every((n) => !n.textContent?.includes("recipeTools"))).toBe(true);
    });
  });

  describe("__agentApis__ registry", () => {
    it("registers recipeTools in window.__agentApis__ on mount", () => {
      render(<WindowApiProvider />);
      expect(window.__agentApis__?.recipeTools).toBeDefined();
    });

    it("window.__agentApis__.recipeTools is the same object as window.recipeTools", () => {
      render(<WindowApiProvider />);
      expect(window.__agentApis__.recipeTools).toBe(window.recipeTools);
    });

    it("removes recipeTools from window.__agentApis__ on unmount", () => {
      const { unmount } = render(<WindowApiProvider />);
      unmount();
      expect(window.__agentApis__?.recipeTools).toBeUndefined();
    });
  });

  describe("listTools", () => {
    it("returns an object with a tools array", () => {
      render(<WindowApiProvider />);
      const result = window.recipeTools.listTools();
      expect(result).toHaveProperty("tools");
      expect(Array.isArray(result.tools)).toBe(true);
    });

    it("includes an entry for every API function", () => {
      render(<WindowApiProvider />);
      const { tools } = window.recipeTools.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain("ping");
      expect(names).toContain("listTools");
      expect(names).toContain("searchRecipes");
    });

    it("each tool has name, description, and inputSchema", () => {
      render(<WindowApiProvider />);
      const { tools } = window.recipeTools.listTools();
      for (const tool of tools) {
        expect(typeof tool.name).toBe("string");
        expect(typeof tool.description).toBe("string");
        expect(tool.inputSchema).toHaveProperty("type", "object");
        expect(tool.inputSchema).toHaveProperty("properties");
      }
    });

    it("searchRecipes inputSchema has required q parameter", () => {
      render(<WindowApiProvider />);
      const { tools } = window.recipeTools.listTools();
      const searchTool = tools.find((t) => t.name === "searchRecipes")!;
      expect(searchTool.inputSchema.properties).toHaveProperty("q");
      expect(searchTool.inputSchema.required).toContain("q");
    });

    it("includes entries for getRecipeViewerRecipe and setRecipeViewerRecipe", () => {
      render(<WindowApiProvider />);
      const { tools } = window.recipeTools.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain("getRecipeViewerRecipe");
      expect(names).toContain("setRecipeViewerRecipe");
    });

    it("setRecipeViewerRecipe inputSchema has required recipe parameter", () => {
      render(<WindowApiProvider />);
      const { tools } = window.recipeTools.listTools();
      const setTool = tools.find((t) => t.name === "setRecipeViewerRecipe")!;
      expect(setTool.inputSchema.properties).toHaveProperty("recipe");
      expect(setTool.inputSchema.required).toContain("recipe");
    });
  });

  describe("getRecipeViewerRecipe / setRecipeViewerRecipe", () => {
    // Cooking mode registers the app's own document; the window API speaks
    // Schema.org in both directions.
    const mockDoc: RecipeDocument = {
      schema: { name: "Spaghetti", "@type": "Recipe" },
      ingredients: makeIngredientLines(["200 g spaghetti"]),
      instructions: makeSteps(["Boil."]),
      prep_time: null,
      cook_time: 600,
      total_time: null,
    };
    const updatedInstructions = [
      {
        "@type": "HowToSection" as const,
        name: "Sauce",
        itemListElement: [
          { "@type": "HowToStep", text: "Whisk.", name: "Whisk", timeRequired: "PT1M" },
        ],
      },
    ];
    const updatedRecipe = {
      name: "Carbonara",
      "@type": "Recipe" as const,
      cookTime: "PT20M",
      recipeIngredient: ["1 egg", { name: "50 g guanciale", group: "Sauce" }],
      recipeInstructions: updatedInstructions,
    };

    it("getRecipeViewerRecipe returns null when cooking mode is not active", () => {
      render(<WindowApiProvider />);
      expect(window.recipeTools.getRecipeViewerRecipe()).toBeNull();
    });

    it("getRecipeViewerRecipe returns the registered recipe as Schema.org while cooking mode is active", () => {
      render(<WindowApiProvider />);
      registerCookingModeRecipe(mockDoc, vi.fn());
      // Times come from the document's columns, ingredients and instructions from its groups.
      expect(window.recipeTools.getRecipeViewerRecipe()).toEqual({
        name: "Spaghetti",
        "@type": "Recipe",
        cookTime: "PT10M",
        recipeIngredient: ["200 g spaghetti"],
        recipeInstructions: [{ "@type": "HowToStep", text: "Boil." }],
      });
    });

    it("setRecipeViewerRecipe updates what getRecipeViewerRecipe returns", () => {
      render(<WindowApiProvider />);
      registerCookingModeRecipe(mockDoc, vi.fn());
      window.recipeTools.setRecipeViewerRecipe(updatedRecipe);
      expect(window.recipeTools.getRecipeViewerRecipe()).toEqual({
        name: "Carbonara",
        "@type": "Recipe",
        cookTime: "PT20M",
        recipeIngredient: ["1 egg", "50 g guanciale"],
        recipeInstructions: updatedInstructions,
      });
    });

    it("setRecipeViewerRecipe hands the registered setter the recipe as a document, lines drafted, steps grouped, times parsed", () => {
      render(<WindowApiProvider />);
      const setter = vi.fn();
      registerCookingModeRecipe(mockDoc, setter);
      window.recipeTools.setRecipeViewerRecipe(updatedRecipe);
      const doc = setter.mock.calls[0][0] as RecipeDocument;
      expect(doc.schema).toEqual({ name: "Carbonara", "@type": "Recipe", cookTime: "PT20M" });
      expect(doc).toMatchObject({ prep_time: null, cook_time: 1200, total_time: null });
      expect(doc.ingredients.map((g) => g.name)).toEqual([undefined, "Sauce"]);
      expect(doc.ingredients[1].ingredients[0]).toMatchObject({
        raw_text: "50 g guanciale",
        quantity: 50,
        unit: "g",
        match_status: "unmatched",
      });
      expect(doc.instructions).toEqual([
        makeInstructionGroup("Sauce", [makeStep("Whisk.", { name: "Whisk", seconds: 60 })]),
      ]);
    });

    it("getRecipeViewerRecipe returns null after unregisterCookingModeRecipe", () => {
      render(<WindowApiProvider />);
      registerCookingModeRecipe(mockDoc, vi.fn());
      unregisterCookingModeRecipe();
      expect(window.recipeTools.getRecipeViewerRecipe()).toBeNull();
    });

    it("setRecipeViewerRecipe does not throw when cooking mode is not active", () => {
      render(<WindowApiProvider />);
      expect(() =>
        window.recipeTools.setRecipeViewerRecipe(updatedRecipe)
      ).not.toThrow();
    });
  });

  describe("searchRecipes", () => {
    let mockPush: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockPush = vi.fn();
      vi.mocked(useRouter).mockReturnValue({
        push: mockPush,
        replace: vi.fn(),
        prefetch: vi.fn(),
        back: vi.fn(),
      });
    });

    it("navigates to /?q=<query> when called", async () => {
      render(<WindowApiProvider />);
      const promise = window.recipeTools.searchRecipes("pasta");
      notifyRecipeUpdate([]);
      await promise;
      expect(mockPush).toHaveBeenCalledWith("/?q=pasta");
    });

    it("encodes the query in the navigation URL", async () => {
      render(<WindowApiProvider />);
      const promise = window.recipeTools.searchRecipes("chicken & rice");
      notifyRecipeUpdate([]);
      await promise;
      expect(mockPush).toHaveBeenCalledWith("/?q=chicken%20%26%20rice");
    });

    it("resolves with schemas provided by notifyRecipeUpdate", async () => {
      const mockSchemas = [
        { name: "Pasta Carbonara", "@type": "Recipe" },
        { name: "Pasta Bolognese", "@type": "Recipe" },
      ];

      render(<WindowApiProvider />);
      const promise = window.recipeTools.searchRecipes("pasta");
      notifyRecipeUpdate(mockSchemas as never);
      const result = await promise;
      expect(result).toEqual(mockSchemas);
    });
  });
});
