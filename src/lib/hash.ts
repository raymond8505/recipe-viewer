// FNV-1a 32-bit hash — stable, non-cryptographic, used for keying localStorage
export function hashUrl(url: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0; // FNV prime, unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0");
}
