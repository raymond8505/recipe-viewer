// The grammar both duration readers accept: the time-only subset of ISO 8601,
// which is all a recipe ever carries. Date-bearing forms ("P4D", "P1DT13H20M")
// are deliberately outside it — see isIsoDuration.
const ISO_DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

/**
 * Whether a string is a duration this module can read at all — as distinct
 * from one that reads as *no* time. "PT0M" is a well-formed zero (a no-cook
 * recipe says so explicitly); "P4D" and "20–22 min" are not durations we can
 * interpret. Both make formatDuration and parseDurationToSeconds return null,
 * so anything that must not silently discard a value — the time backfill —
 * needs this to tell the two apart.
 */
export function isIsoDuration(value: string | undefined | null): boolean {
  return !!value && ISO_DURATION.test(value);
}

/**
 * Parse an ISO 8601 duration string into a human-readable format.
 * e.g. "PT1H30M" → "1 hr 30 min", "PT45M" → "45 min"
 */
export function formatDuration(iso: string | undefined | null): string | null {
  if (!iso) return null;

  const match = iso.match(ISO_DURATION);
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
  const match = iso.match(ISO_DURATION);
  if (!match) return null;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------
// Recipe times ↔ seconds.
//
// `recipes.prep_time` / `cook_time` / `total_time` are integer SECONDS, while
// SchemaRecipe (and therefore JSON-LD, the MCP tools and every scraper) speaks
// ISO 8601. `parseDurationToSeconds` above is already the ISO → column
// direction, so there is no second reader to keep in step; these are the
// return trip, all built on msToIsoDuration/formatDuration so the file still
// has one parsing rule and one formatting rule.
//
// The editor works in HH:MM, which is coarser than the column. That is a
// deliberate asymmetry — a recipe time is written in hours and minutes — but
// it means a stored value carrying seconds cannot survive being edited: see
// formatTimeInput.
// ---------------------------------------------------------------------------

/** Seconds (a column value) → ISO 8601, for the schema. */
export function secondsToIso(
  seconds: number | null | undefined,
): string | undefined {
  if (seconds == null) return undefined;
  return msToIsoDuration(0, seconds);
}

/** Seconds (a column value) → "1 hr 30 min" display. */
export function formatSeconds(
  seconds: number | null | undefined,
): string | null {
  return formatDuration(secondsToIso(seconds));
}

/**
 * Seconds (a column value) → the editor's `H:MM` text; blank for no time.
 *
 * ROUNDS TO THE NEAREST MINUTE, because HH:MM cannot express anything finer.
 * A stored 4h5m30s seeds the field as "4:06", so focusing and blurring the
 * input rewrites the value and the 30 seconds are gone. Accepted: two values
 * in the entire recipe set carry a seconds component, and neither is a time a
 * cook acts on to that precision.
 */
export function formatTimeInput(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "";
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}

/**
 * Parse a recipe-time field from the editor into SECONDS. Three-way, like
 * `parseNumeric`: a number sets the time, `null` clears it, `undefined` means
 * "unparseable — leave the stored value alone" (a save is never blocked by a
 * bad time).
 *
 * `H:MM` is the canonical form and what the field is seeded and re-formatted
 * with. A bare number is read as MINUTES ("45" → 0:45) and unit-tagged forms
 * are accepted too ("1h30m", "1 hr 30 min"); both canonicalize on blur, which
 * is how the field teaches its own format. Minutes past 59 carry into hours
 * ("1:75" → 2:15), as `parseMS` already does for step timers.
 *
 * Note the colon means HOURS here, unlike `parseMS`, where "1:30" is a
 * 90-second step timer — a recipe written "1:30" takes an hour and a half.
 *
 * Zero collapses to `null`: "0:00" and "no time" are not a distinction the
 * label can render, and NULL is how the column spells the latter.
 */
export function parseTimeInput(raw: string): number | null | undefined {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  const toSeconds = (minutes: number) => (minutes > 0 ? minutes * 60 : null);

  if (/^\d+$/.test(text)) return toSeconds(parseInt(text, 10));

  const clock = text.match(/^(\d+):(\d{1,2})$/);
  if (clock) {
    return toSeconds(parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10));
  }

  const tagged = text.match(
    /^(?:(\d+)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes))?$/,
  );
  if (tagged && (tagged[1] || tagged[2])) {
    return toSeconds(
      (tagged[1] ? parseInt(tagged[1], 10) : 0) * 60 +
        (tagged[2] ? parseInt(tagged[2], 10) : 0),
    );
  }
  return undefined;
}

/**
 * Re-spell an editor time entry in canonical `H:MM`, for the input's blur
 * handler. Returns null when the text doesn't parse, meaning "leave what the
 * user typed alone" — the same degrade `parseTimeInput` does, so a typo is
 * still visible to fix rather than silently rewritten or dropped.
 */
export function canonicalizeTimeInput(raw: string): string | null {
  const seconds = parseTimeInput(raw);
  if (seconds === undefined) return null;
  return formatTimeInput(seconds);
}

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
      Math.max(0, parseInt(m, 10) || 0) * 60 +
      Math.max(0, parseInt(s, 10) || 0);
    return { minutes: Math.floor(total / 60), seconds: total % 60 };
  }
  return { minutes: Math.max(0, parseInt(text, 10) || 0), seconds: 0 };
}

// "" → null (clear the value); anything unparseable → undefined (field
// dropped from a patch rather than sent as garbage).
export function parseNumeric(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Nutrition display rounding: values over 1 round to the nearest integer
 * (9.96 → "10 g", 12.4 → "12 g"); values ≤ 1 round to 2dp (0.2 → "0.2 g") —
 * integer-rounding those would erase them entirely. Display-only: JSON-LD/MCP
 * serialization keeps its own (1dp) precision.
 *
 * `compact` closes the gap before the unit ("10g"), for surfaces measured in
 * pixels rather than reading comfort — a recipe card's badges. Spaced is the
 * default because the panel and the Nutrition Facts label are prose-width and
 * the label follows the FDA's spacing.
 */
export function formatNutrientDisplay(
  nv: NutrientValue,
  { compact = false }: { compact?: boolean } = {},
): string {
  const rounded =
    nv.value > 1 ? Math.round(nv.value) : Math.round(nv.value * 100) / 100;
  if (!nv.unit) return String(rounded);
  return compact ? `${rounded}${nv.unit}` : `${rounded} ${nv.unit}`;
}

/** Pick the singular or plural form of a noun for a count. Returns the word
 *  only — callers render the count separately. Defaults the plural to the
 *  singular + "s"; pass an explicit plural for irregular nouns. */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return count === 1 ? singular : plural;
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
import type { NutrientValue } from "./nutritionMath";
import { ingredientTexts } from "./recipeIngredients";
import { canonicalizeInstructions } from "./recipeInstructions";
import type {
  HowToSection,
  HowToStep,
  QuantitativeValue,
  RecipeDocument,
  RecipeIngredientGroup,
  RecipeIngredientGroupInput,
  RecipeInstructionGroup,
  RecipeStep,
  SchemaOrgHowToSection,
  SchemaOrgInstructionItem,
  SchemaOrgInstructions,
  SchemaOrgRecipe,
  SchemaRecipe,
} from "@/types/recipe";
import type {
  EditableIngredients,
  EditableInstructions,
  EditableStep,
} from "@/types/editor";

/**
 * The `source` value marking a recipe authored in this app rather than scraped
 * from someone else's page. Self-authored rows used to carry the site's own
 * hostname instead, which made "is this mine?" a question about deploy config —
 * it broke on staging hosts and on any future rename. This literal is the
 * host-independent replacement; see migration 0015.
 */
export const CUSTOM_RECIPE_SOURCE = "custom";

/**
 * Whether a recipe is the user's own — i.e. it has no upstream page behind it.
 * Structurally typed so both a `RecipeRow` and a bare `{ source }` work.
 *
 * Reads case-insensitively, writes canonically: `source` is a free-text field
 * an agent or a person can fill, so "Custom" must mean the same thing as
 * "custom", while the value we *store* is always the lowercase literal (see
 * canonicalizeRecipeSource).
 */
export function isOwnRecipe(recipe: { source?: string | null }): boolean {
  return recipe.source?.toLowerCase() === CUSTOM_RECIPE_SOURCE;
}

/**
 * The spelling of `source` to persist. Only the own-recipe value is folded —
 * every other source is a real name ("An Edible Mosaic") whose casing is
 * content, not a token, so it is stored exactly as given.
 */
export function canonicalizeRecipeSource(source: string): string {
  return isOwnRecipe({ source }) ? CUSTOM_RECIPE_SOURCE : source;
}

/**
 * Whether a string can be handed to an `<a href>` we open in a new tab: an
 * absolute http(s) URL. Two jobs — it hides the "open source" affordance while
 * a URL is still being typed, and it keeps a `javascript:` value out of an href
 * the user controls.
 */
export function isBrowsableUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
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
 * Human-readable label for a `recipeYield` in any form: QuantitativeValue →
 * "value unitText" ("4 kebabs"); string → itself; array → its first element.
 * Returns null when there's nothing to show.
 */
export function getYieldLabel(
  recipeYield: SchemaRecipe["recipeYield"],
): string | null {
  if (recipeYield == null) return null;
  if (typeof recipeYield === "object" && !Array.isArray(recipeYield)) {
    const parts = [recipeYield.value, recipeYield.unitText].filter(
      (p) => p != null && p !== "",
    );
    return parts.length ? parts.join(" ") : null;
  }
  const raw = Array.isArray(recipeYield) ? recipeYield[0] : recipeYield;
  return raw || null;
}

/**
 * The raw weight/volume reference on an object-form `recipeYield`, or null for
 * string/array/absent yields (which have no valueReference). Used to compute
 * the per-serving weight shown in the nutrition panel.
 */
export function getYieldValueReference(
  recipeYield: SchemaRecipe["recipeYield"],
): QuantitativeValue | null {
  if (
    recipeYield != null &&
    typeof recipeYield === "object" &&
    !Array.isArray(recipeYield)
  ) {
    return recipeYield.valueReference ?? null;
  }
  return null;
}

/**
 * The serving-unit label for a `recipeYield` — a QuantitativeValue's `unitText`
 * (e.g. "kebabs"), used to label the servings stepper so the unit stays visible
 * while scaling. null for string/array/absent yields (the stepper falls back to
 * the generic "Servings").
 */
export function getYieldUnit(
  recipeYield: SchemaRecipe["recipeYield"],
): string | null {
  if (
    recipeYield != null &&
    typeof recipeYield === "object" &&
    !Array.isArray(recipeYield)
  ) {
    return recipeYield.unitText?.trim() || null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The outbound Schema.org edge.
//
// Internally a recipe is a RecipeDocument: the stored schema, the ingredient
// groups, the instruction groups, and the column-backed times. Anything that
// leaves the app as a Schema.org Recipe — the JSON-LD script, the
// image-generation webhook, the window API — is assembled here and nowhere
// else. Every column-backed field is read from its column (times in seconds →
// ISO 8601; lines → their text, groups in order; instruction groups → HowTo
// steps and sections), never from the copy the blob may still carry, so this
// is the translation layer that grows as more of `metadata.schema` moves out.
// The inbound half is `documentFromSchemaOrg` in ./recipeDocument.
// ---------------------------------------------------------------------------

const DOCUMENT_TIME_FIELDS = [
  ["prepTime", "prep_time"],
  ["cookTime", "cook_time"],
  ["totalTime", "total_time"],
] as const;

/** The Schema.org time keys a document's columns produce: ISO strings, absent for a null column. */
function schemaOrgTimes(
  doc: RecipeDocument,
): Partial<Pick<SchemaOrgRecipe, "prepTime" | "cookTime" | "totalTime">> {
  const times: Partial<
    Pick<SchemaOrgRecipe, "prepTime" | "cookTime" | "totalTime">
  > = {};
  for (const [key, column] of DOCUMENT_TIME_FIELDS) {
    const iso = secondsToIso(doc[column]);
    if (iso !== undefined) times[key] = iso;
  }
  return times;
}

/**
 * The whole recipe as a Schema.org Recipe, custom fields included: the stored
 * schema, its three time keys replaced from the columns, `recipeIngredient`
 * flattened to the lines' text, and `recipeInstructions` as HowTo steps and
 * sections. For consumers that want the full document (the image webhook
 * reads `notes`; the window API hands agents everything). JSON-LD, which must
 * be spec-clean, goes through `toSchemaOrgJsonLd` instead.
 */
export function toSchemaOrgRecipe(doc: RecipeDocument): SchemaOrgRecipe {
  const { prepTime: _p, cookTime: _c, totalTime: _t, ...rest } = doc.schema;
  void _p;
  void _c;
  void _t;
  const texts = ingredientTexts(doc.ingredients);
  const steps = toSchemaOrgInstructions(doc.instructions);
  return {
    ...rest,
    ...schemaOrgTimes(doc),
    ...(texts.length > 0 ? { recipeIngredient: texts } : {}),
    ...(steps.length > 0 ? { recipeInstructions: steps } : {}),
  };
}

/**
 * Return a Schema.org-compliant JSON-LD object for a recipe. An explicit
 * allowlist of standard fields, so custom extensions (notes, cookingNotes) can
 * never leak; times from the columns; `recipeIngredient` as plain strings —
 * group names and row ids are ours, not Schema.org's; `recipeInstructions`
 * from the document's groups.
 *
 * `nutritionOverride` is the ONLY source of the output's `nutrition` — the
 * normalized-ingredient nutrition, already per-serving and Schema.org-shaped.
 * Omit it and the key is omitted: the stored `schema.nutrition` is deliberately
 * not a fallback here, for the same reason `ScalableRecipe.nutrition()` won't
 * serve it, so what we publish always traces back to the ingredient catalog.
 */
export function toSchemaOrgJsonLd(
  doc: RecipeDocument,
  options?: { nutritionOverride?: SchemaRecipe["nutrition"] },
): object {
  const { schema } = doc;
  const result: Record<string, unknown> = {
    "@context": schema["@context"] ?? "https://schema.org",
    "@type": schema["@type"] ?? "Recipe",
    name: schema.name,
  };
  const nutrition = options?.nutritionOverride;
  const optionalFields = [
    "description",
    "image",
    "author",
    "recipeYield",
    "recipeCuisine",
    "recipeCategory",
    "keywords",
    "datePublished",
  ] as const;
  for (const key of optionalFields) {
    if (schema[key] != null) result[key] = schema[key];
  }
  Object.assign(result, schemaOrgTimes(doc));
  if (nutrition != null) result.nutrition = nutrition;
  const texts = ingredientTexts(doc.ingredients);
  if (texts.length > 0) result.recipeIngredient = texts;
  const steps = toSchemaOrgInstructions(doc.instructions);
  if (steps.length > 0) result.recipeInstructions = steps;
  return result;
}

// ---------------------------------------------------------------------------
// Instructions ↔ Schema.org recipeInstructions.
//
// Internally a recipe's instructions are RecipeInstructionGroup[]. The
// Schema.org form — a flat array of HowToStep and HowToSection — exists at the
// edges only, and this pair is the whole translation. Grouping is BY RUN, not
// by first appearance as ingredients are: steps are sequential, so top-level
// steps on either side of a section stay on either side.
// ---------------------------------------------------------------------------

/**
 * Parse markdown into instruction groups: "## Name" opens a named group,
 * "- text" / "* text" / "1. text" and bare lines are steps in the current
 * group (nameless before any heading), blank lines are ignored. The string
 * form some scrapers deliver `recipeInstructions` in.
 */
export function markdownToInstructions(markdown: string): RecipeInstructionGroup[] {
  const groups: RecipeInstructionGroup[] = [];
  let current: RecipeInstructionGroup | null = null;

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("## ")) {
      current = { name: line.slice(3).trim(), steps: [] };
      groups.push(current);
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
    if (!current) {
      current = { steps: [] };
      groups.push(current);
    }
    current.steps.push({ text });
  }

  return canonicalizeInstructions(groups);
}

function isSchemaOrgSection(item: SchemaOrgInstructionItem): item is SchemaOrgHowToSection {
  return typeof item === "object" && item !== null && item["@type"] === "HowToSection";
}

/** One inbound item that is not a section → at most one step; an object with no text is nothing. */
function stepFromSchemaOrg(item: string | HowToStep): RecipeStep[] {
  if (typeof item === "string") return [{ text: item }];
  if (typeof item?.text !== "string") return [];
  const step: RecipeStep = { text: item.text };
  if (typeof item.name === "string" && item.name.trim()) step.name = item.name;
  const seconds = parseDurationToSeconds(item.timeRequired);
  if (step.name && seconds) step.seconds = seconds;
  return [step];
}

/**
 * The inbound edge: `recipeInstructions` as a scrape, create_recipe, the
 * re-scrape webhook or the window API delivers it → canonical groups. Accepts
 * every shape the wild produces — a markdown string, one bare item, or an
 * array mixing strings, `{ text }` objects with or without `@type`, and
 * sections whose `itemListElement` is an array, a single step or missing.
 *
 * A duration survives only beside a name (the rule `stepTimers` reads);
 * "PT0M" and durations the parser can't read are dropped with it.
 */
export function fromSchemaOrgInstructions(
  raw: SchemaOrgInstructions | null | undefined,
): RecipeInstructionGroup[] {
  if (raw == null) return [];
  if (typeof raw === "string") return markdownToInstructions(raw);

  const groups: RecipeInstructionGroup[] = [];
  let run: RecipeInstructionGroup | null = null;
  for (const item of Array.isArray(raw) ? raw : [raw]) {
    if (isSchemaOrgSection(item)) {
      run = null;
      const list = item.itemListElement;
      const items = Array.isArray(list) ? list : list == null ? [] : [list];
      groups.push({
        name: typeof item.name === "string" ? item.name : "",
        steps: items.flatMap(stepFromSchemaOrg),
      });
      continue;
    }
    if (!run) {
      run = { steps: [] };
      groups.push(run);
    }
    run.steps.push(...stepFromSchemaOrg(item));
  }
  return canonicalizeInstructions(groups);
}

function stepToSchemaOrg(step: RecipeStep): HowToStep {
  const out: HowToStep = { "@type": "HowToStep", text: step.text };
  if (step.name) out.name = step.name;
  const iso = step.name ? secondsToIso(step.seconds) : undefined;
  if (iso) out.timeRequired = iso;
  return out;
}

/**
 * The outbound edge: groups → the flat HowTo array. A nameless group emits its
 * steps at the top level, a named one becomes a HowToSection; `timeRequired`
 * is set only on a step with both a label and a duration. Callers omit the
 * `recipeInstructions` key when this is empty.
 */
export function toSchemaOrgInstructions(
  groups: readonly RecipeInstructionGroup[],
): Array<HowToStep | HowToSection> {
  const result: Array<HowToStep | HowToSection> = [];
  for (const group of groups) {
    if (group.steps.length === 0) continue;
    const steps = group.steps.map(stepToSchemaOrg);
    if (group.name) {
      result.push({ "@type": "HowToSection", name: group.name, itemListElement: steps });
    } else {
      result.push(...steps);
    }
  }
  return result;
}

/**
 * Render instruction groups to a markdown fragment: a named group is a
 * "## Name" header followed by its steps as "- text", a nameless group is its
 * steps alone, and groups are separated by a blank line. Consumed by
 * `recipeToMarkdown` for the searchable `content`/embedding text — it is NOT
 * part of the editor (which uses the structured converters).
 */
export function instructionsToMarkdown(
  instructions: readonly RecipeInstructionGroup[],
): string {
  const blocks: string[] = [];
  for (const group of instructions) {
    if (group.steps.length === 0) continue;
    const lines = group.name ? [`## ${group.name}`] : [];
    for (const step of group.steps) lines.push(`- ${step.text}`);
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

/**
 * Render a recipe to a plain markdown document.
 *
 * This is the value stored in the `content` column AND the text embedded for
 * semantic search, so it should capture the full substance of the recipe
 * (title, description, ingredients, instructions, key metadata) in a stable,
 * deterministic form. Custom/internal fields (notes, cookingNotes) are
 * intentionally excluded — they aren't part of the recipe's searchable body.
 */
export function recipeToMarkdown(
  schema: SchemaRecipe,
  ingredients: readonly RecipeIngredientGroup[],
  instructions: readonly RecipeInstructionGroup[],
): string {
  const blocks: string[] = [`# ${schema.name}`];

  if (schema.description) blocks.push(schema.description);

  const meta: string[] = [];
  const yieldValue = getYieldLabel(schema.recipeYield);
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

  if (ingredients.some((group) => group.ingredients.length > 0)) {
    const lines = ["## Ingredients"];
    for (const group of ingredients) {
      if (group.ingredients.length === 0) continue;
      if (group.name) lines.push(`### ${group.name}`);
      for (const item of group.ingredients) lines.push(`- ${item.raw_text}`);
    }
    blocks.push(lines.join("\n"));
  }

  if (instructions.some((group) => group.steps.length > 0)) {
    blocks.push(`## Instructions\n${instructionsToMarkdown(instructions)}`);
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
// Structured-editor converters (UI tree ⇄ recipe)
//
// Both editor trees map one to one onto the recipe's own groups —
// RecipeIngredientGroup[] and RecipeInstructionGroup[]. These four functions
// are the single translation boundary — see `src/types/editor.ts`. They
// preserve group order so a load → save round-trip is lossless; they never
// inject empty groups.
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

/**
 * Ingredient groups → editor groups. Each row's id rides along as
 * `recipeIngredientId`, which is what lets a save keep the row (and the catalog
 * association curated on it) rather than minting a new one for every line. A
 * recipe with no ingredients seeds one empty nameless group so the editor has
 * somewhere to type.
 */
export function ingredientsToEditable(
  ingredients: readonly RecipeIngredientGroup[],
): EditableIngredients {
  if (ingredients.length === 0)
    return [{ id: nanoid(), heading: null, items: [] }];
  return ingredients.map((group) => ({
    id: nanoid(),
    heading: group.name ?? null,
    items: group.ingredients.map((ing) => ({
      id: nanoid(),
      recipeIngredientId: ing.id,
      name: ing.raw_text,
    })),
  }));
}

/** Editor groups → write input. Blank-name rows are dropped, as are groups
 *  left with no rows; a blank heading is a nameless group. */
export function editableToIngredientInput(
  groups: EditableIngredients,
): RecipeIngredientGroupInput[] {
  const result: RecipeIngredientGroupInput[] = [];
  for (const group of groups) {
    const name = group.heading?.trim() || undefined;
    const ingredients = group.items.flatMap((item) => {
      const raw_text = item.name.trim();
      if (!raw_text) return [];
      return [
        item.recipeIngredientId != null
          ? { id: item.recipeIngredientId, raw_text }
          : { raw_text },
      ];
    });
    if (ingredients.length === 0) continue;
    result.push(name ? { name, ingredients } : { ingredients });
  }
  return result;
}

function stepToEditable(step: RecipeStep): EditableStep {
  const secs = step.seconds ?? 0;
  return {
    id: nanoid(),
    text: step.text,
    name: step.name ?? "",
    minutes: Math.floor(secs / 60),
    seconds: secs % 60,
  };
}

/** Instruction groups → editor groups: heading is the group's name (null when nameless), a timer's seconds split into minutes:seconds. */
export function instructionsToEditable(
  instructions: readonly RecipeInstructionGroup[],
): EditableInstructions {
  return instructions.map((group) => ({
    id: nanoid(),
    heading: group.name ?? null,
    items: group.steps.map(stepToEditable),
  }));
}

/** Editor groups → instruction groups, in canonical form: blank steps and
 *  empty groups dropped, a blank heading is a nameless group, and a timer's
 *  minutes:seconds survive only beside a label (the editor enforces the same
 *  rule before Save). */
export function editableToInstructions(
  groups: EditableInstructions,
): RecipeInstructionGroup[] {
  return canonicalizeInstructions(
    groups.map((group) => ({
      ...(group.heading != null ? { name: group.heading } : {}),
      steps: group.items.map((item) => ({
        text: item.text,
        name: item.name,
        seconds:
          Math.max(0, Math.floor(item.minutes || 0)) * 60 +
          Math.max(0, Math.floor(item.seconds || 0)),
      })),
    })),
  );
}
