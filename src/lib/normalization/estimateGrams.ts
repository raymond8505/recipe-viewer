import { generateStructured } from "@/lib/gemini";

// LLM estimate of a recipe line's total gram weight — the rescue for lines the
// density path can't convert: a volume unit matched to a density-less
// ingredient, or a count/can line like "540 ml canned chickpeas drained"
// (a can-yield, not a linear density). Shared by the normalization graph's
// `estimate` node and the NutritionDetail per-line "Estimate" endpoint.
//
// Imports only the raw-fetch Gemini client (no @langchain/langgraph, no
// graph.ts) so a route handler can import it without pulling the graph module
// — the auth-gate test cold-loads every route.
//
// Best-effort like the rest of the pipeline: returns null on any failure so the
// caller degrades (line stays unmatched/excluded) rather than erroring.

const GRAMS_SCHEMA = {
  type: "object",
  properties: {
    grams: {
      type: "number",
      nullable: true,
      description:
        "Total weight in grams of the ingredient in this line, or null if it cannot be estimated.",
    },
  },
  required: ["grams"],
};

function estimatePrompt(input: {
  rawText: string;
  name: string;
  quantity: number | null;
  unit: string | null;
}): string {
  return [
    "Estimate the total weight, in grams, of the ingredient in this single recipe ingredient line.",
    "",
    "Account for typical ingredient densities (e.g. chopped garlic, flour, chopped herbs) AND standard package/can/drained yields — for a canned item the volume is the can size, so return the DRAINED solid weight, not the volume in grams.",
    "",
    `Line: "${input.rawText}"`,
    `Ingredient: ${input.name}`,
    `Parsed quantity: ${input.quantity ?? "unknown"}`,
    `Parsed unit: ${input.unit ?? "none (count/unitless)"}`,
    "",
    "Return the grams as a single positive number. Return null if you genuinely cannot estimate it.",
  ].join("\n");
}

/**
 * Estimate one line's gram weight. Returns a positive, finite number of grams,
 * or null when the model declines or the response is unusable.
 */
export async function estimateLineGrams(input: {
  rawText: string;
  name: string;
  quantity: number | null;
  unit: string | null;
}): Promise<number | null> {
  const result = await generateStructured<{ grams: number | null }>({
    prompt: estimatePrompt(input),
    responseSchema: GRAMS_SCHEMA,
  });

  const grams = result?.grams;
  if (typeof grams !== "number" || !Number.isFinite(grams) || grams <= 0) {
    return null;
  }
  return grams;
}
