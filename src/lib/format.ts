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
export function parseDurationToSeconds(
  iso: string | undefined | null,
): number | null {
  if (!iso) return null;
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** minutes/seconds → "m:ss" display; a zero duration is blank (no timer).
 *  Minutes are not capped, so a long step reads e.g. "90:00". */
export function formatMS(minutes: number, seconds: number): string {
  if (minutes <= 0 && seconds <= 0) return "";
  return `${minutes}:${pad(seconds)}`;
}

/** Lenient parse of a duration: "5:30" → 5m30s (seconds ≥60 carry into
 *  minutes); a bare number is minutes ("5" → 5:00). Never time-of-day, so no
 *  AM/PM. */
export function parseMS(raw: string): { minutes: number; seconds: number } {
  const text = raw.trim();
  if (!text) return { minutes: 0, seconds: 0 };
  if (text.includes(":")) {
    const [m, s] = text.split(":");
    const total =
      Math.max(0, parseInt(m, 10) || 0) * 60 + Math.max(0, parseInt(s, 10) || 0);
    return { minutes: Math.floor(total / 60), seconds: total % 60 };
  }
  return { minutes: Math.max(0, parseInt(text, 10) || 0), seconds: 0 };
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

import { nanoid } from "nanoid";
import type {
  HowToSection,
  HowToStep,
  RecipeIngredient,
  SchemaRecipe,
} from "@/types/recipe";
import type {
  EditableIngredients,
  EditableInstructions,
  EditableStep,
} from "@/types/editor";

/**
 * Get the ingredient text from a string or RecipeIngredient object.
 */
export function getIngredientText(
  ingredient: string | RecipeIngredient,
): string {
  return typeof ingredient === "string" ? ingredient : ingredient.name;
}

/**
 * Group an ingredient list by group. Returns a single group with
 * a null heading when no ingredient defines group.
 */
export function groupIngredients(
  ingredients: Array<string | RecipeIngredient>,
): Array<{ heading: string | null; items: Array<string | RecipeIngredient> }> {
  const hasGroups = ingredients.some(
    (i) => typeof i !== "string" && i.group != null,
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
  image: string | string[] | undefined | null,
): string | null {
  if (!image) return null;
  if (Array.isArray(image)) return image[0]?.trimEnd() ?? null;
  return image.trimEnd();
}

/**
 * Return a Schema.org-compliant JSON-LD object for a recipe.
 * Strips custom extensions (notes, cookingNotes, ingredient group objects) so
 * external tools that validate against the spec can parse the output cleanly.
 */
export function toSchemaOrgJsonLd(schema: SchemaRecipe): object {
  const result: Record<string, unknown> = {
    "@context": schema["@context"] ?? "https://schema.org",
    "@type": schema["@type"] ?? "Recipe",
    name: schema.name,
  };
  const optionalFields = [
    "description",
    "image",
    "author",
    "cookTime",
    "prepTime",
    "totalTime",
    "recipeYield",
    "recipeCuisine",
    "recipeCategory",
    "keywords",
    "nutrition",
    "datePublished",
    "recipeInstructions",
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
 * Parse a markdown string into structured recipe instructions.
 *
 * "## Section Name" → opens a new HowToSection
 * "- text", "* text", "1. text" → HowToStep added to current section (or top-level)
 * Bare non-empty lines → treated as a step
 * Empty lines → ignored
 */
export function markdownToInstructions(
  markdown: string,
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

export function normalizeRecipeInstructions(
  raw: unknown,
): Array<HowToStep | HowToSection> | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string") return markdownToInstructions(raw);
  if (Array.isArray(raw)) return raw as Array<HowToStep | HowToSection>;
  return [raw as HowToStep | HowToSection];
}

/**
 * Render structured recipe instructions to a markdown fragment.
 *
 * HowToSection → "## Section Name" header followed by its steps as "- text";
 * a top-level HowToStep → "- text"; sections are separated by a blank line.
 * Consumed by `schemaToMarkdown` to build the searchable `content`/embedding
 * text — it is NOT part of the editor (which uses the structured converters).
 */
export function instructionsToMarkdown(
  instructions: Array<HowToStep | HowToSection>,
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
 * Render a recipe schema to a plain markdown document.
 *
 * This is the value stored in the `content` column AND the text embedded for
 * semantic search, so it should capture the full substance of the recipe
 * (title, description, ingredients, instructions, key metadata) in a stable,
 * deterministic form. Custom/internal fields (notes, cookingNotes) are
 * intentionally excluded — they aren't part of the recipe's searchable body.
 */
export function schemaToMarkdown(schema: SchemaRecipe): string {
  const blocks: string[] = [`# ${schema.name}`];

  if (schema.description) blocks.push(schema.description);

  const meta: string[] = [];
  const yieldValue = toArray(schema.recipeYield)[0];
  if (yieldValue) meta.push(`Yield: ${yieldValue}`);
  const prep = formatDuration(schema.prepTime);
  if (prep) meta.push(`Prep: ${prep}`);
  const cook = formatDuration(schema.cookTime);
  if (cook) meta.push(`Cook: ${cook}`);
  const total = formatDuration(schema.totalTime);
  if (total) meta.push(`Total: ${total}`);
  if (schema.recipeCuisine) meta.push(`Cuisine: ${schema.recipeCuisine}`);
  const category = toArray(schema.recipeCategory)[0];
  if (category) meta.push(`Category: ${category}`);
  if (meta.length) blocks.push(meta.join(" · "));

  if (schema.recipeIngredient?.length) {
    const lines = ["## Ingredients"];
    for (const { heading, items } of groupIngredients(schema.recipeIngredient)) {
      if (heading) lines.push(`### ${heading}`);
      for (const item of items) lines.push(`- ${getIngredientText(item)}`);
    }
    blocks.push(lines.join("\n"));
  }

  if (schema.recipeInstructions?.length) {
    blocks.push(
      `## Instructions\n${instructionsToMarkdown(schema.recipeInstructions)}`,
    );
  }

  return blocks.join("\n\n");
}

/**
 * Normalize recipeCategory/recipeCuisine to an array.
 */
export function toArray(val: string | string[] | undefined | null): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return [val];
}

// ---------------------------------------------------------------------------
// Structured-editor converters (UI tree ⇄ stored schema)
//
// Groups exist ONLY in the editor's draft. The stored schema is flat:
// ingredients carry a `group` string, instructions are HowToStep/HowToSection.
// These four functions are the single translation boundary — see
// `src/types/editor.ts`. They preserve group order so a load → save round-trip
// is lossless; they never inject empty groups.
// ---------------------------------------------------------------------------

/**
 * Build an ISO 8601 duration from minutes + seconds. Returns undefined when
 * both are zero/blank (so a step with no timer omits `timeRequired`). Minutes
 * over 59 are normalized into hours so the stored duration stays canonical
 * (e.g. 90:00 → "PT1H30M", 5:30 → "PT5M30S").
 */
export function msToIsoDuration(
  minutes: number,
  seconds: number,
): string | undefined {
  const total =
    Math.max(0, Math.floor(minutes || 0)) * 60 +
    Math.max(0, Math.floor(seconds || 0));
  if (total <= 0) return undefined;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  let out = "PT";
  if (h > 0) out += `${h}H`;
  if (m > 0) out += `${m}M`;
  if (s > 0) out += `${s}S`;
  return out;
}

/** Stored ingredient list → editor groups (insertion order preserved). */
export function schemaToEditableIngredients(
  ingredients: Array<string | RecipeIngredient>,
): EditableIngredients {
  return groupIngredients(ingredients).map(({ heading, items }) => ({
    id: nanoid(),
    heading,
    items: items.map((ing) => ({ id: nanoid(), name: getIngredientText(ing) })),
  }));
}

/** Editor groups → stored ingredient list. Blank-name rows are dropped; a
 *  group with a blank heading is treated as ungrouped (plain strings). */
export function editableIngredientsToSchema(
  groups: EditableIngredients,
): Array<string | RecipeIngredient> {
  const result: Array<string | RecipeIngredient> = [];
  for (const group of groups) {
    const heading = group.heading?.trim() || null;
    for (const item of group.items) {
      const name = item.name.trim();
      if (!name) continue;
      result.push(heading ? { name, group: heading } : name);
    }
  }
  return result;
}

function stepToEditable(step: HowToStep): EditableStep {
  const secs = parseDurationToSeconds(step.timeRequired) ?? 0;
  return {
    id: nanoid(),
    text: step.text,
    name: step.name ?? "",
    minutes: Math.floor(secs / 60),
    seconds: secs % 60,
  };
}

/** Stored instructions → editor groups. Top-level steps collect into a
 *  null-heading group; HowToSections become headed groups (order preserved). */
export function schemaToEditableInstructions(
  instructions: Array<HowToStep | HowToSection>,
): EditableInstructions {
  const groups: EditableInstructions = [];
  let looseGroup: EditableInstructions[number] | null = null;
  for (const item of instructions) {
    if (item["@type"] === "HowToSection") {
      looseGroup = null;
      const section = item as HowToSection;
      groups.push({
        id: nanoid(),
        heading: section.name,
        items: section.itemListElement.map(stepToEditable),
      });
    } else {
      if (!looseGroup) {
        looseGroup = { id: nanoid(), heading: null, items: [] };
        groups.push(looseGroup);
      }
      looseGroup.items.push(stepToEditable(item as HowToStep));
    }
  }
  return groups;
}

/** Editor groups → stored instructions. Blank-text steps are dropped; `name`
 *  and `timeRequired` are emitted only when BOTH are set (co-dependency).
 *  A headed group becomes a HowToSection; the null group emits top-level
 *  steps. Groups that yield no steps are dropped. */
export function editableInstructionsToSchema(
  groups: EditableInstructions,
): Array<HowToStep | HowToSection> {
  const result: Array<HowToStep | HowToSection> = [];
  for (const group of groups) {
    const steps: HowToStep[] = [];
    for (const item of group.items) {
      const text = item.text.trim();
      if (!text) continue;
      const step: HowToStep = { "@type": "HowToStep", text };
      const name = item.name.trim();
      const duration = msToIsoDuration(item.minutes, item.seconds);
      if (name) step.name = name;
      if (name && duration) step.timeRequired = duration;
      steps.push(step);
    }
    if (steps.length === 0) continue;
    const heading = group.heading?.trim() || null;
    if (heading) {
      result.push({
        "@type": "HowToSection",
        name: heading,
        itemListElement: steps,
      });
    } else {
      result.push(...steps);
    }
  }
  return result;
}
