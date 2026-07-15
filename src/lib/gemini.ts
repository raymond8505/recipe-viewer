import { env } from "@/env";
import { fetchWithRetry } from "./retry";

// Gemini text generation with structured (JSON-schema-constrained) output.
// Raw fetch like src/lib/embedding.ts — no SDK. Flash-Lite is the default:
// the normalization workflow's parse/adjudicate steps are
// pick-from-a-shortlist tasks, and Lite ships with thinking off (lowest
// latency/cost). Callers can override per call if a task needs headroom.
export const DEFAULT_STRUCTURED_MODEL = "gemini-2.5-flash-lite";

interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

export interface GenerateStructuredOptions {
  prompt: string;
  // Gemini responseSchema (OpenAPI-subset JSON schema), passed through
  // verbatim. The API constrains decoding to it, so the parsed JSON matches
  // the schema shape — callers still own semantic validation.
  responseSchema: Record<string, unknown>;
  model?: string;
}

/**
 * Generate schema-constrained JSON via the Gemini API.
 *
 * Best-effort like generateEmbedding: any failure (network error, non-200,
 * missing candidates, unparseable JSON) is logged and returns `null` — callers
 * degrade (e.g. fall back to the deterministic ingredient parser) rather than
 * failing a recipe save.
 */
export async function generateStructured<T>(
  opts: GenerateStructuredOptions,
): Promise<T | null> {
  const model = opts.model ?? DEFAULT_STRUCTURED_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  try {
    const res = await fetchWithRetry(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: opts.prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: opts.responseSchema,
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`Structured generation failed (${res.status}): ${detail}`);
      return null;
    }

    const body = (await res.json()) as GenerateContentResponse;
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || text.length === 0) {
      console.error("Structured generation response missing candidate text");
      return null;
    }

    return JSON.parse(text) as T;
  } catch (err) {
    console.error("Structured generation threw:", err);
    return null;
  }
}
