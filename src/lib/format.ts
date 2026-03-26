/**
 * Parse an ISO 8601 duration string into a human-readable format.
 * e.g. "PT1H30M" → "1 hr 30 min", "PT45M" → "45 min"
 */
export function formatDuration(iso: string | undefined | null): string | null {
  if (!iso) return null;

  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  if (hours === 0 && minutes === 0) return null;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hr`);
  if (minutes > 0) parts.push(`${minutes} min`);

  return parts.join(" ");
}

/**
 * Parse an ISO 8601 duration string into total seconds.
 * e.g. "PT30M" → 1800, "PT1H30M" → 5400, "PT45S" → 45
 */
export function parseDurationToSeconds(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

/**
 * Format an ISO 8601 date string to a human-readable date.
 * e.g. "2026-02-25" → "February 25, 2026"
 */
export function formatDate(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

import type { RecipeIngredient, SchemaRecipe } from "@/types/recipe";

/**
 * Get the ingredient text from a string or RecipeIngredient object.
 */
export function getIngredientText(ingredient: string | RecipeIngredient): string {
  return typeof ingredient === "string" ? ingredient : ingredient.name;
}

/**
 * Group an ingredient list by group. Returns a single group with
 * a null heading when no ingredient defines group.
 */
export function groupIngredients(
  ingredients: Array<string | RecipeIngredient>
): Array<{ heading: string | null; items: Array<string | RecipeIngredient> }> {
  const hasGroups = ingredients.some(
    (i) => typeof i !== "string" && i.group != null
  );
  if (!hasGroups) return [{ heading: null, items: ingredients }];

  const order: Array<string | null> = [];
  const map = new Map<string | null, Array<string | RecipeIngredient>>();
  for (const ing of ingredients) {
    const group = typeof ing === "string" ? null : (ing.group ?? null);
    if (!map.has(group)) {
      order.push(group);
      map.set(group, []);
    }
    map.get(group)!.push(ing);
  }
  return order.map((heading) => ({ heading, items: map.get(heading)! }));
}

/**
 * Get the first image URL from a recipe image field (string or string[]).
 */
export function getFirstImage(
  image: string | string[] | undefined | null
): string | null {
  if (!image) return null;
  if (Array.isArray(image)) return image[0] ?? null;
  return image;
}

/**
 * Return a Schema.org-compliant JSON-LD object for a recipe.
 * Strips custom extensions (notes, ingredient group objects) so external
 * tools that validate against the spec can parse the output cleanly.
 */
export function toSchemaOrgJsonLd(schema: SchemaRecipe): object {
  const result: Record<string, unknown> = {
    "@context": schema["@context"] ?? "https://schema.org",
    "@type": schema["@type"] ?? "Recipe",
    name: schema.name,
  };
  const optionalFields = [
    "description", "image", "author", "cookTime", "prepTime", "totalTime",
    "recipeYield", "recipeCuisine", "recipeCategory", "keywords",
    "nutrition", "datePublished", "recipeInstructions",
  ] as const;
  for (const key of optionalFields) {
    if (schema[key] != null) result[key] = schema[key];
  }
  if (schema.recipeIngredient?.length) {
    result.recipeIngredient = schema.recipeIngredient.map(getIngredientText);
  }
  return result;
}

/**
 * Normalize recipeCategory/recipeCuisine to an array.
 */
export function toArray(
  val: string | string[] | undefined | null
): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return [val];
}
