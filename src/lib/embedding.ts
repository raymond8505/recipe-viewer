import { env } from "@/env";

// Google Gemini embedding model. At outputDimensionality below 3072 this model
// returns UN-normalized vectors, so we L2-normalize ourselves before storing —
// otherwise cosine/inner-product similarity in pgvector is meaningless.
const MODEL = "gemini-embedding-001";
const OUTPUT_DIMENSIONALITY = 768;
const TASK_TYPE = "RETRIEVAL_DOCUMENT";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`;

interface EmbedContentResponse {
  embedding?: { values?: number[] };
}

function l2Normalize(values: number[]): number[] {
  let sumSquares = 0;
  for (const v of values) sumSquares += v * v;
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) return values;
  return values.map((v) => v / magnitude);
}

/**
 * Generate an L2-normalized embedding for `text` via the Gemini API.
 *
 * Best-effort: any failure (network error, non-200, malformed body, empty
 * vector) is logged and returns `null` — callers persist the recipe regardless
 * and simply leave the embedding column untouched.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: TASK_TYPE,
        outputDimensionality: OUTPUT_DIMENSIONALITY,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`Embedding request failed (${res.status}): ${detail}`);
      return null;
    }

    const body = (await res.json()) as EmbedContentResponse;
    const values = body.embedding?.values;
    if (!Array.isArray(values) || values.length === 0) {
      console.error("Embedding response missing embedding.values");
      return null;
    }

    return l2Normalize(values);
  } catch (err) {
    console.error("Embedding request threw:", err);
    return null;
  }
}
