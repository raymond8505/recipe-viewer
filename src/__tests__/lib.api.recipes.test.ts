// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";
import { uploadRecipeImageFile } from "@/lib/api/recipes";

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
