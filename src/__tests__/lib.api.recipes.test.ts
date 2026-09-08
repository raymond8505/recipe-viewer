// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  normalizeRecipe,
  saveRecipe,
  updateRecipeIngredientLine,
  uploadRecipeImageFile,
} from "@/lib/api/recipes";
import { makeIngredientLines } from "@/fixtures";

function mockFetchOnce(status: number, body: object) {
  const mock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadRecipeImageFile", () => {
  const file = new File([new Uint8Array([1, 2, 3])], "x.png", {
    type: "image/png",
  });

  it("POSTs the file as form data and returns the image URL", async () => {
    const mock = mockFetchOnce(200, { image: "https://cdn.example.com/x.png" });

    const url = await uploadRecipeImageFile("recipe-1", file);

    expect(url).toBe("https://cdn.example.com/x.png");
    const [requestUrl, init] = mock.mock.calls[0];
    expect(requestUrl).toBe("/api/recipes/recipe-1/upload-image");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get("file")).toBe(file);
    // The UI saves the image via its own verified full-schema save, so it opts
    // out of the route's default schema update.
    expect(init.body.get("updateSchema")).toBe("false");
  });

  it("throws when the response is not ok", async () => {
    mockFetchOnce(413, { error: "too big" });

    await expect(uploadRecipeImageFile("recipe-1", file)).rejects.toThrow(
      /413/,
    );
  });

  it("throws when a 200 response has no image URL", async () => {
    mockFetchOnce(200, { something: "else" });

    await expect(uploadRecipeImageFile("recipe-1", file)).rejects.toThrow(
      /no image URL/,
    );
  });

  it("throws when image is present but not a string", async () => {
    mockFetchOnce(200, { image: 42 });

    await expect(uploadRecipeImageFile("recipe-1", file)).rejects.toThrow(
      /no image URL/,
    );
  });
});

describe("saveRecipe", () => {
  const body = {
    schema: { name: "Cake" },
    ingredients: [{ ingredients: [{ id: "ri-1", raw_text: "2 cups flour" }] }],
    status: "draft",
    url: "https://example.com",
    source: "example.com",
  };

  it("POSTs the document to /update and returns what was persisted", async () => {
    const saved = {
      schema: { name: "Cake" },
      ingredients: makeIngredientLines(["2 cups flour"]),
      status: "draft",
      url: "https://example.com",
      source: "example.com",
    };
    const mock = mockFetchOnce(200, saved);

    const out = await saveRecipe("recipe-1", body);

    expect(out).toEqual(saved);
    const [requestUrl, init] = mock.mock.calls[0];
    expect(requestUrl).toBe("/api/recipes/recipe-1/update");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  // The client re-seeds its whole document from the echo, so a response
  // missing either half would wipe state — fail at the boundary instead.
  it("throws when a 200 response omits the ingredients", async () => {
    mockFetchOnce(200, { schema: { name: "Cake" }, status: "draft" });

    await expect(saveRecipe("recipe-1", body)).rejects.toThrow(/no recipe/);
  });

  it("throws when the response is not ok", async () => {
    mockFetchOnce(500, { error: "boom" });

    await expect(saveRecipe("recipe-1", body)).rejects.toThrow(/500/);
  });
});

describe("updateRecipeIngredientLine", () => {
  it("PATCHes the line by id and returns the recipe's groups", async () => {
    const ingredients = makeIngredientLines(["6 g magic dust"]);
    const mock = mockFetchOnce(200, { ingredients });

    const out = await updateRecipeIngredientLine("recipe-1", "ri-1", "6 g magic dust");

    expect(out.ingredients).toEqual(ingredients);
    const [requestUrl, init] = mock.mock.calls[0];
    expect(requestUrl).toBe("/api/recipes/recipe-1/ingredients");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ id: "ri-1", text: "6 g magic dust" });
  });

  // A 200 without the groups leaves the caller holding its pre-edit copy, and
  // the edited line renders as if it has lost its match. Fail at the boundary
  // rather than let that reach state.
  it("throws when a 200 response omits the ingredients", async () => {
    mockFetchOnce(200, { ok: true });

    await expect(
      updateRecipeIngredientLine("recipe-1", "ri-1", "6 g magic dust"),
    ).rejects.toThrow(/no ingredients/);
  });

  it("throws when the response is not ok", async () => {
    mockFetchOnce(500, { error: "boom" });

    await expect(
      updateRecipeIngredientLine("recipe-1", "ri-1", "6 g magic dust"),
    ).rejects.toThrow(/500/);
  });
});

describe("normalizeRecipe", () => {
  it("POSTs to the normalize route", async () => {
    const mock = mockFetchOnce(200, { status: "queued" });

    await normalizeRecipe("recipe-1");

    const [requestUrl, init] = mock.mock.calls[0];
    expect(requestUrl).toBe("/api/recipes/recipe-1/normalize");
    expect(init.method).toBe("POST");
  });

  it("throws when the response is not ok", async () => {
    mockFetchOnce(500, { error: "boom" });

    await expect(normalizeRecipe("recipe-1")).rejects.toThrow(/500/);
  });
});
