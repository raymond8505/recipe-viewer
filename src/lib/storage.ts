import { BlockList, isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { env } from "@/env";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  extensionForContentType,
  type AllowedImageContentType,
} from "@/lib/imageTypes";

export {
  IMAGE_CONTENT_TYPES,
  ALLOWED_IMAGE_CONTENT_TYPES,
  extensionForContentType,
  type AllowedImageContentType,
} from "@/lib/imageTypes";

export const RECIPE_BUCKET = "recipes";
export const FETCH_TIMEOUT_MS = 10_000;

export class StorageUploadError extends Error {
  constructor(
    public kind:
      | "unsupported_type"
      | "upload_failed"
      | "too_large"
      | "bad_url"
      | "fetch_failed",
    public detail: string,
  ) {
    super(`${kind}: ${detail}`);
    this.name = "StorageUploadError";
  }
}

const blockedIPs = (() => {
  const list = new BlockList();
  list.addSubnet("10.0.0.0", 8);
  list.addSubnet("172.16.0.0", 12);
  list.addSubnet("192.168.0.0", 16);
  list.addSubnet("127.0.0.0", 8);
  list.addSubnet("169.254.0.0", 16);
  list.addSubnet("0.0.0.0", 8);
  list.addAddress("::1", "ipv6");
  list.addSubnet("fc00::", 7, "ipv6");
  list.addSubnet("fe80::", 10, "ipv6");
  return list;
})();

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new StorageUploadError("bad_url", "Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new StorageUploadError("bad_url", `Unsupported scheme: ${url.protocol}`);
  }
  let hostname = url.hostname;
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }
  let ip: string;
  let family: 4 | 6;
  const literal = isIP(hostname);
  if (literal === 4 || literal === 6) {
    ip = hostname;
    family = literal;
  } else {
    try {
      const resolved = await dnsLookup(hostname);
      ip = resolved.address;
      family = resolved.family as 4 | 6;
    } catch {
      throw new StorageUploadError("bad_url", `Failed to resolve hostname: ${hostname}`);
    }
  }
  if (blockedIPs.check(ip, family === 4 ? "ipv4" : "ipv6")) {
    throw new StorageUploadError(
      "bad_url",
      "URL resolves to a private, loopback, or link-local address",
    );
  }
  return url;
}

export async function fetchImageBytes(
  rawUrl: string,
): Promise<{ bytes: Buffer; contentType: AllowedImageContentType }> {
  const url = await assertSafeUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } catch (err) {
    throw new StorageUploadError(
      "fetch_failed",
      err instanceof Error ? err.message : "Fetch failed",
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new StorageUploadError("fetch_failed", `HTTP ${res.status} from ${url.host}`);
  }
  const ct = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!ALLOWED_IMAGE_CONTENT_TYPES.includes(ct as AllowedImageContentType)) {
    throw new StorageUploadError(
      "unsupported_type",
      `Response Content-Type ${ct || "(missing)"} not allowed`,
    );
  }
  const declared = res.headers.get("content-length");
  if (declared && Number(declared) > env.MAX_IMAGE_BYTES) {
    throw new StorageUploadError(
      "too_large",
      `Response declares ${declared} bytes (max ${env.MAX_IMAGE_BYTES})`,
    );
  }
  const reader = res.body?.getReader();
  if (!reader) {
    throw new StorageUploadError("fetch_failed", "Response had no body");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > env.MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new StorageUploadError(
        "too_large",
        `Response exceeded ${env.MAX_IMAGE_BYTES} bytes`,
      );
    }
    chunks.push(value);
  }
  return {
    bytes: Buffer.concat(chunks),
    contentType: ct as AllowedImageContentType,
  };
}

export async function uploadRecipeImage(
  recipeId: string,
  bytes: Uint8Array | Buffer,
  contentType: string,
): Promise<string> {
  const ext = extensionForContentType(contentType);
  if (!ext) {
    throw new StorageUploadError(
      "unsupported_type",
      `Content type ${contentType} not allowed`,
    );
  }

  const key = `${recipeId}-${Date.now()}.${ext}`;
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(RECIPE_BUCKET)
    .upload(key, bytes, { contentType, upsert: false });

  if (error) {
    throw new StorageUploadError("upload_failed", error.message);
  }

  return supabase.storage.from(RECIPE_BUCKET).getPublicUrl(key).data.publicUrl;
}
