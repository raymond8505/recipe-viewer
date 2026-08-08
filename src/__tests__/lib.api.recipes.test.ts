// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  normalizeRecipe,
  updateRecipeIngredientLine,
  uploadRecipeImageFile,
} from "@/lib/api/recipes";

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

describe("updateRecipeIngredientLine", () => {
  it("PATCHes the line and returns both the lines and the re-parsed rows", async () => {
    const rows = [{ id: "ri-1", line_id: "L1", raw_text: "6 g magic dust" }];
    const mock = mockFetchOnce(200, {
      recipeIngredient: [{ name: "6 g magic dust", id: "L1" }],
      rows,
    });

    const out = await updateRecipeIngredientLine("recipe-1", 1, "6 g magic dust");

    expect(out.recipeIngredient).toEqual([{ name: "6 g magic dust", id: "L1" }]);
    expect(out.rows).toEqual(rows);
    const [requestUrl, init] = mock.mock.calls[0];
    expect(requestUrl).toBe("/api/recipes/recipe-1/ingredients");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ index: 1, text: "6 g magic dust" });
  });

  // A 200 without the rows would leave the caller holding its pre-edit copy —
  // the edited line would render as though its match had been dropped. Fail at
  // the boundary rather than let that reach state.
  it("throws when a 200 response omits the rows", async () => {
    mockFetchOnce(200, { recipeIngredient: ["6 g magic dust"] });

    await expect(
      updateRecipeIngredientLine("recipe-1", 1, "6 g magic dust"),
    ).rejects.toThrow(/no lines/);
  });

  it("throws when the response is not ok", async () => {
    mockFetchOnce(500, { error: "boom" });

    await expect(
      updateRecipeIngredientLine("recipe-1", 1, "6 g magic dust"),
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
