// Client-safe image type config — no node: imports, so client components
// can use it (storage.ts pulls in node:net and must stay server-only).
// Fallback for the max upload size when MAX_IMAGE_BYTES isn't set in the
// environment. The runtime source of truth is env.MAX_IMAGE_BYTES (src/env.ts
// defaults to this value); client components receive it as a prop since they
// can't read server env vars.
export const DEFAULT_MAX_IMAGE_BYTES = 4_000_000;

export const IMAGE_CONTENT_TYPES = {
  "image/png": { ext: "png" },
  "image/jpeg": { ext: "jpg" },
  "image/webp": { ext: "webp" },
} as const;

export type AllowedImageContentType = keyof typeof IMAGE_CONTENT_TYPES;

export const ALLOWED_IMAGE_CONTENT_TYPES = Object.keys(
  IMAGE_CONTENT_TYPES,
) as AllowedImageContentType[];

export function extensionForContentType(
  contentType: string,
): (typeof IMAGE_CONTENT_TYPES)[AllowedImageContentType]["ext"] | null {
  return (
    IMAGE_CONTENT_TYPES[contentType as AllowedImageContentType]?.ext ?? null
  );
}
