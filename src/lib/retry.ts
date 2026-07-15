// Retry-with-backoff wrapper around `fetch`, shared by the external-API clients
// (src/lib/gemini.ts, src/lib/embedding.ts, src/lib/usda.ts). It retries only
// TRANSIENT failures — thrown network errors, per-attempt timeouts, and a small
// set of retryable HTTP statuses — and otherwise behaves exactly like `fetch`:
// on ultimate failure it returns the last error Response, or rethrows the last
// thrown error. That transparency is deliberate — each client keeps its own
// `res.ok` / catch logic (best-effort `null` for Gemini/embedding, throwing
// `UsdaError` for USDA); the retry is invisible to them.

export interface RetryOptions {
  /** Retries after the first attempt (default 2 → up to 3 total attempts). */
  retries?: number;
  /** Base backoff delay in ms (default 300). */
  baseDelayMs?: number;
  /** Exponential growth factor per attempt (default 2). */
  factor?: number;
  /** Upper bound on any single backoff delay, incl. Retry-After (default 5000). */
  maxDelayMs?: number;
  /** Per-attempt timeout in ms; a slow attempt is aborted and retried (default 15000). */
  timeoutMs?: number;
  /** HTTP statuses that trigger a retry (default 408/429/500/502/503/504). */
  retryableStatuses?: number[];
  /**
   * Caller abort signal. Unlike the internal timeout, an external abort is
   * treated as intentional cancellation — it rethrows immediately and is never
   * retried. (No current caller passes one; this is future-proofing.)
   */
  signal?: AbortSignal;
}

const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 300;
const DEFAULT_FACTOR = 2;
const DEFAULT_MAX_DELAY_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 15_000;
// 408 Request Timeout, 429 Too Many Requests, and the 5xx gateway family are
// the transient failures worth a retry. A 4xx like 400/401/403/404 is a client
// error that a retry won't fix, so it returns immediately.
const DEFAULT_RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse a `Retry-After` header into a delay in ms. Supports both forms from
 * RFC 9110: delta-seconds (e.g. `"120"`) and an HTTP-date. Returns null when
 * absent or unparseable, so the caller falls back to jittered backoff.
 */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

/**
 * `fetch` with exponential backoff + full jitter and a per-attempt timeout.
 * See the file header for the failure contract. Every knob is overridable via
 * `opts`; the defaults suit low-frequency recipe/ingredient traffic.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const factor = opts.factor ?? DEFAULT_FACTOR;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryableStatuses = opts.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

  let lastError: unknown;
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Per-attempt timeout — same AbortController pattern as
    // src/lib/storage.ts's fetchImageBytes. The internal timeout aborts count
    // as retryable network errors; an external (caller) abort does not.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      lastResponse = res;
      lastError = undefined;
      // A non-retryable status (ok or a client error) is the final answer.
      if (!retryableStatuses.includes(res.status)) return res;
    } catch (err) {
      // A caller-initiated abort is intentional — surface it, don't retry.
      if (opts.signal?.aborted) throw err;
      lastResponse = undefined;
      lastError = err;
    } finally {
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener("abort", onExternalAbort);
    }

    if (attempt === retries) break;

    // Prefer the server's Retry-After (429/503) when present; else jittered
    // exponential backoff. Both are capped at maxDelayMs so a hostile or large
    // header can't stall the process.
    const retryAfter = lastResponse
      ? parseRetryAfter(lastResponse.headers.get("retry-after"))
      : null;
    const delay =
      retryAfter !== null
        ? Math.min(maxDelayMs, retryAfter)
        : Math.random() * Math.min(maxDelayMs, baseDelayMs * factor ** attempt);
    await sleep(delay);
  }

  // Exhausted: mirror what a bare fetch would have surfaced.
  if (lastResponse !== undefined) return lastResponse;
  throw lastError;
}
