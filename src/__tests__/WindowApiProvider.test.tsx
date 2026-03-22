import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import WindowApiProvider from "@/components/WindowApiProvider";
import { notifyRecipeUpdate, registerCookingModeRecipe, unregisterCookingModeRecipe } from "@/lib/windowApi";
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
    const mockRecipe = { name: "Spaghetti", "@type": "Recipe" as const };
    const updatedRecipe = { name: "Carbonara", "@type": "Recipe" as const };

    it("getRecipeViewerRecipe returns null when cooking mode is not active", () => {
      render(<WindowApiProvider />);
      expect(window.recipeTools.getRecipeViewerRecipe()).toBeNull();
    });

    it("getRecipeViewerRecipe returns the registered recipe while cooking mode is active", () => {
      render(<WindowApiProvider />);
      registerCookingModeRecipe(mockRecipe as never, vi.fn());
      expect(window.recipeTools.getRecipeViewerRecipe()).toEqual(mockRecipe);
    });

    it("setRecipeViewerRecipe updates what getRecipeViewerRecipe returns", () => {
      render(<WindowApiProvider />);
      registerCookingModeRecipe(mockRecipe as never, vi.fn());
      window.recipeTools.setRecipeViewerRecipe(updatedRecipe as never);
      expect(window.recipeTools.getRecipeViewerRecipe()).toEqual(updatedRecipe);
    });

    it("setRecipeViewerRecipe calls the registered setter with the new recipe", () => {
      render(<WindowApiProvider />);
      const setter = vi.fn();
      registerCookingModeRecipe(mockRecipe as never, setter);
      window.recipeTools.setRecipeViewerRecipe(updatedRecipe as never);
      expect(setter).toHaveBeenCalledWith(updatedRecipe);
    });

    it("getRecipeViewerRecipe returns null after unregisterCookingModeRecipe", () => {
      render(<WindowApiProvider />);
      registerCookingModeRecipe(mockRecipe as never, vi.fn());
      unregisterCookingModeRecipe();
      expect(window.recipeTools.getRecipeViewerRecipe()).toBeNull();
    });

    it("setRecipeViewerRecipe does not throw when cooking mode is not active", () => {
      render(<WindowApiProvider />);
      expect(() =>
        window.recipeTools.setRecipeViewerRecipe(updatedRecipe as never)
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
