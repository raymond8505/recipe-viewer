// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accreteAliasesFromLines,
  addAliasesAndReembed,
  ingredientEmbeddingText,
  ingredientQueryText,
  removeAliasAndReembed,
} from "@/lib/ingredientAliases";
import {
  IngredientRepoError,
  addIngredientAliases,
  removeIngredientAlias,
  updateIngredientRow,
  type AliasMutationResult,
} from "@/lib/ingredients";
import { generateEmbedding } from "@/lib/embedding";

vi.mock("@/lib/ingredients", async (orig) => {
  const actual = await orig<typeof import("@/lib/ingredients")>();
  return {
    ...actual,
    addIngredientAliases: vi.fn(),
    removeIngredientAlias: vi.fn(),
    updateIngredientRow: vi.fn(),
  };
});

vi.mock("@/lib/embedding", () => ({ generateEmbedding: vi.fn() }));

function result(over: Partial<AliasMutationResult> = {}): AliasMutationResult {
  return {
    id: "ing-1",
    name: "Coriander (cilantro) leaves, raw",
    aliases: ["cilantro"],
    changed: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(generateEmbedding).mockResolvedValue([0.1, 0.2]);
  vi.mocked(addIngredientAliases).mockResolvedValue(result());
  vi.mocked(removeIngredientAlias).mockResolvedValue(result({ aliases: [] }));
});

describe("ingredientEmbeddingText", () => {
  it("leads with the canonical name, then the aliases", () => {
    expect(ingredientEmbeddingText("butter", ["sweet butter", "unsalted"])).toBe(
      "butter, sweet butter, unsalted",
    );
  });

  it("lowercases — case normalization belongs at the matching boundary", () => {
    expect(ingredientEmbeddingText("Butter, Without Salt", ["Sweet Butter"])).toBe(
      "butter, without salt, sweet butter",
    );
  });

  it("drops blank aliases rather than emitting empty segments", () => {
    expect(ingredientEmbeddingText("butter", ["", "   ", "ghee"])).toBe(
      "butter, ghee",
    );
  });
});

describe("ingredientQueryText", () => {
  it("normalizes identically to the document side", () => {
    // Both sides of a cosine comparison must fold case the same way — an
    // asymmetry here would make matching worse, not better. Asserting them
    // against one input is what fails the build if they ever drift apart.
    const input = "  Unsalted Butter  ";
    expect(ingredientQueryText(input)).toBe(
      ingredientEmbeddingText(input.trim(), []),
    );
    expect(ingredientQueryText(input)).toBe("unsalted butter");
  });
});

describe("addAliasesAndReembed", () => {
  it("re-embeds the joined name + aliases when the set changed", async () => {
    vi.mocked(addIngredientAliases).mockResolvedValue(
      result({ name: "Onions, raw", aliases: ["onion", "medium onions"] }),
    );

    await addAliasesAndReembed("ing-1", ["medium onions"]);

    expect(addIngredientAliases).toHaveBeenCalledWith("ing-1", ["medium onions"]);
    expect(generateEmbedding).toHaveBeenCalledWith(
      "onions, raw, onion, medium onions",
    );
    expect(updateIngredientRow).toHaveBeenCalledWith("ing-1", {
      embedding: [0.1, 0.2],
    });
  });

  it("spends NO embedding call when nothing changed", async () => {
    // This short-circuit is what keeps steady-state cost at zero: re-normalizing
    // an unchanged recipe must not re-embed every ingredient it touches.
    vi.mocked(addIngredientAliases).mockResolvedValue(result({ changed: false }));

    await addAliasesAndReembed("ing-1", ["cilantro"]);

    expect(generateEmbedding).not.toHaveBeenCalled();
    expect(updateIngredientRow).not.toHaveBeenCalled();
  });

  it("returns null and writes nothing when the ingredient is gone", async () => {
    vi.mocked(addIngredientAliases).mockResolvedValue(null);

    await expect(addAliasesAndReembed("ing-gone", ["x"])).resolves.toBeNull();
    expect(generateEmbedding).not.toHaveBeenCalled();
    expect(updateIngredientRow).not.toHaveBeenCalled();
  });

  it("leaves the prior vector in place when the embedding call fails", async () => {
    // The column is NOT NULL (db/migrations/0006) — it can be replaced but
    // never cleared, so a failed embedding must be a no-op, not a null write.
    vi.mocked(generateEmbedding).mockResolvedValue(null);

    await addAliasesAndReembed("ing-1", ["cilantro"]);

    expect(updateIngredientRow).not.toHaveBeenCalled();
  });

  it("never throws when the RPC fails", async () => {
    // Alias upkeep runs AFTER the association it describes is committed, so it
    // must not be able to fail the caller's request or normalization run.
    vi.mocked(addIngredientAliases).mockRejectedValue(
      new IngredientRepoError("update_failed", "rpc down"),
    );

    await expect(addAliasesAndReembed("ing-1", ["x"])).resolves.toBeNull();
  });

  it("never throws when the embedding write fails", async () => {
    vi.mocked(updateIngredientRow).mockRejectedValue(
      new IngredientRepoError("update_failed", "db down"),
    );

    await expect(addAliasesAndReembed("ing-1", ["x"])).resolves.toBeNull();
  });
});

describe("removeAliasAndReembed", () => {
  it("re-embeds from the surviving aliases", async () => {
    vi.mocked(removeIngredientAlias).mockResolvedValue(
      result({ name: "Onions, raw", aliases: ["onion"] }),
    );

    await removeAliasAndReembed("ing-1", "medium onions");

    expect(removeIngredientAlias).toHaveBeenCalledWith("ing-1", "medium onions");
    expect(generateEmbedding).toHaveBeenCalledWith("onions, raw, onion");
    expect(updateIngredientRow).toHaveBeenCalledWith("ing-1", {
      embedding: [0.1, 0.2],
    });
  });

  it("spends no embedding call when the alias wasn't there", async () => {
    vi.mocked(removeIngredientAlias).mockResolvedValue(result({ changed: false }));

    await removeAliasAndReembed("ing-1", "never-present");

    expect(generateEmbedding).not.toHaveBeenCalled();
  });

  it("never throws when the RPC fails", async () => {
    vi.mocked(removeIngredientAlias).mockRejectedValue(
      new IngredientRepoError("update_failed", "rpc down"),
    );

    await expect(removeAliasAndReembed("ing-1", "x")).resolves.toBeNull();
  });
});

describe("accreteAliasesFromLines", () => {
  it("batches every line for one ingredient into a single call", async () => {
    // Five lines sharing a catalog row must cost one RPC and one re-embed,
    // not five of each.
    await accreteAliasesFromLines([
      { ingredient_id: "ing-1", name_text: "cilantro" },
      { ingredient_id: "ing-1", name_text: "fresh coriander" },
      { ingredient_id: "ing-2", name_text: "onion" },
    ]);

    expect(addIngredientAliases).toHaveBeenCalledTimes(2);
    expect(addIngredientAliases).toHaveBeenCalledWith("ing-1", [
      "cilantro",
      "fresh coriander",
    ]);
    expect(addIngredientAliases).toHaveBeenCalledWith("ing-2", ["onion"]);
  });

  it("dedupes by comparison only — the first casing is passed through verbatim", async () => {
    // Aliases are display data. A test that only counted the result would pass
    // an implementation that lowercased them, so assert the actual string.
    await accreteAliasesFromLines([
      { ingredient_id: "ing-1", name_text: "Scallions" },
      { ingredient_id: "ing-1", name_text: "scallions" },
      { ingredient_id: "ing-1", name_text: "  SCALLIONS  " },
    ]);

    expect(addIngredientAliases).toHaveBeenCalledWith("ing-1", ["Scallions"]);
  });

  it("skips unmatched lines and blank names", async () => {
    await accreteAliasesFromLines([
      { ingredient_id: null, name_text: "mystery powder" },
      { ingredient_id: "ing-1", name_text: "   " },
    ]);

    expect(addIngredientAliases).not.toHaveBeenCalled();
  });

  it("issues no calls for an empty line list", async () => {
    await accreteAliasesFromLines([]);

    expect(addIngredientAliases).not.toHaveBeenCalled();
  });

  it("never throws when one ingredient's mutation fails", async () => {
    vi.mocked(addIngredientAliases).mockRejectedValue(
      new IngredientRepoError("update_failed", "rpc down"),
    );

    await expect(
      accreteAliasesFromLines([{ ingredient_id: "ing-1", name_text: "cilantro" }]),
    ).resolves.toBeUndefined();
  });
});
