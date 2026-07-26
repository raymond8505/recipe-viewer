import { generateStructured } from "@/lib/gemini";

// LLM estimate of an ingredient's bulk density (g/ml) — the rescue for USDA
// imports whose detail payload carries no foodPortions to derive one from
// (the abridged format never does; see getFoodDetail). A density on the
// catalog row lets volume lines convert deterministically at match time
// instead of falling through to per-line gram estimates on every recipe.
//
// Same contract as estimateLineGrams: imports only the raw-fetch Gemini
// client (no @langchain/langgraph, no graph.ts) so route handlers can import
// it without pulling the graph module, and best-effort — null on any failure
// or implausible value, so the caller persists a null density and the
// line-level rescue still applies.

const DENSITY_SCHEMA = {
  type: "object",
  properties: {
    grams_per_ml: {
      type: "number",
      nullable: true,
      description:
        "Bulk density of the ingredient in grams per milliliter, or null if it cannot be estimated.",
    },
  },
  required: ["grams_per_ml"],
};

// Food densities live in a narrow band (chopped leafy herbs ~0.1, flours
// ~0.5-0.6, liquids ~1, honey ~1.4, salt ~2.6). A value outside (0, 3] means the model
// answered something other than g/ml — discard it rather than persist a
// number that would silently corrupt every volume→gram conversion.
const MAX_PLAUSIBLE_DENSITY_G_PER_ML = 3;

function densityPrompt(input: {
  name: string;
  usdaDescription: string;
}): string {
  return [
    "Estimate the bulk density of this food ingredient, in grams per milliliter (g/ml), as it would be measured by volume in a recipe (spooned into a measuring cup or spoon).",
    "",
    `Ingredient: ${input.name}`,
    `USDA description: ${input.usdaDescription}`,
    "",
    "Reference points: water 1.0, all-purpose flour ~0.53, granulated sugar ~0.85, honey ~1.42, chopped fresh herbs ~0.1.",
    "Return a single positive number of grams per milliliter. Return null if the ingredient is not meaningfully measured by volume (e.g. whole discrete items like eggs in shell) or you cannot estimate it.",
  ].join("\n");
}

/**
 * Estimate an ingredient's density in g/ml. Returns a positive, finite,
 * food-plausible number rounded to 3 decimals (deriveDensity's precision), or
 * null when the model declines or the response is unusable.
 */
export async function estimateDensity(input: {
  name: string;
  usdaDescription: string;
}): Promise<number | null> {
  const result = await generateStructured<{ grams_per_ml: number | null }>({
    prompt: densityPrompt(input),
    responseSchema: DENSITY_SCHEMA,
  });

  const density = result?.grams_per_ml;
  if (
    typeof density !== "number" ||
    !Number.isFinite(density) ||
    density <= 0 ||
    density > MAX_PLAUSIBLE_DENSITY_G_PER_ML
  ) {
    return null;
  }
  return Math.round(density * 1000) / 1000;
}
