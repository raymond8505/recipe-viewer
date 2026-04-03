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

import type { HowToSection, HowToStep, RecipeIngredient, SchemaRecipe } from "@/types/recipe";

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
 * Convert structured recipe instructions to an editable markdown string.
 *
 * HowToSection → "## Section Name" header followed by its steps as "- text"
 * Top-level HowToStep → "- text"
 * Sections are separated by a blank line.
 */
export function instructionsToMarkdown(
  instructions: Array<HowToStep | HowToSection>
): string {
  const blocks: string[] = [];
  for (const item of instructions) {
    if (item["@type"] === "HowToSection") {
      const section = item as HowToSection;
      const lines = [`## ${section.name}`];
      for (const step of section.itemListElement) {
        lines.push(`- ${step.text}`);
      }
      blocks.push(lines.join("\n"));
    } else {
      blocks.push(`- ${(item as HowToStep).text}`);
    }
  }
  return blocks.join("\n\n");
}

/**
 * Parse an editable markdown string back to structured recipe instructions.
 *
 * "## Section Name" → opens a new HowToSection
 * "- text", "* text", "1. text" → HowToStep added to current section (or top-level)
 * Bare non-empty lines → treated as a step
 * Empty lines → ignored
 */
export function markdownToInstructions(
  markdown: string
): Array<HowToStep | HowToSection> {
  const result: Array<HowToStep | HowToSection> = [];
  let currentSection: HowToSection | null = null;

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("## ")) {
      currentSection = {
        "@type": "HowToSection",
        name: line.slice(3).trim(),
        itemListElement: [],
      };
      result.push(currentSection);
      continue;
    }

    let text: string;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      text = line.slice(2).trim();
    } else if (/^\d+\.\s/.test(line)) {
      text = line.replace(/^\d+\.\s+/, "").trim();
    } else {
      text = line;
    }

    if (!text) continue;
    const step: HowToStep = { "@type": "HowToStep", text };
    if (currentSection) {
      currentSection.itemListElement.push(step);
    } else {
      result.push(step);
    }
  }

  return result;
}

/**
 * Convert a recipe ingredient list to an editable plain-text string.
 *
 * Groups are emitted as "## Group Name" headers before their ingredients.
 * Ungrouped ingredients have no header. One ingredient per line.
 */
export function ingredientsToText(
  ingredients: Array<string | RecipeIngredient>
): string {
  const groups = groupIngredients(ingredients);
  const blocks: string[] = [];
  for (const { heading, items } of groups) {
    const lines: string[] = [];
    if (heading) lines.push(`## ${heading}`);
    for (const item of items) lines.push(getIngredientText(item));
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

/**
 * Parse an editable plain-text ingredient list back to structured ingredients.
 *
 * "## Group Name" → sets the current group for subsequent ingredients
 * Other non-empty lines → ingredient; emits { name, group } if group is active,
 *   otherwise a plain string
 * Empty lines → ignored
 */
export function textToIngredients(
  text: string
): Array<string | RecipeIngredient> {
  const result: Array<string | RecipeIngredient> = [];
  let currentGroup: string | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("## ")) {
      currentGroup = line.slice(3).trim();
      continue;
    }

    if (currentGroup) {
      result.push({ name: line, group: currentGroup });
    } else {
      result.push(line);
    }
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
