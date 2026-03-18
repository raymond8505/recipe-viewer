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
 * Normalize recipeCategory/recipeCuisine to an array.
 */
export function toArray(
  val: string | string[] | undefined | null
): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return [val];
}
