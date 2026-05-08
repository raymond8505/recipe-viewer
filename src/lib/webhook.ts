import type { FlatRecipeRow, RecipeRow } from "@/types/recipe";

type WebhookEnvelope = { recipes: FlatRecipeRow[] };

export type WebhookResult =
  | { ok: true; recipes: RecipeRow[] }
  | { ok: false; status: 502; error: string; detail?: unknown };

export async function callRecipeWebhook(opts: {
  url: string;
  payload: Record<string, unknown>;
  minRecipes?: number;
}): Promise<WebhookResult> {
  const { url, payload, minRecipes = 2 } = opts;

  let webhookRes: Response;
  try {
    webhookRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, status: 502, error: "Webhook unreachable" };
  }

  const rawText = await webhookRes.text().catch(() => "");

  if (!webhookRes.ok) {
    return { ok: false, status: 502, error: "Webhook request failed", detail: rawText };
  }

  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    return { ok: false, status: 502, error: "Webhook returned invalid JSON", detail: rawText };
  }

  const entry = Array.isArray(data)
    ? (data as WebhookEnvelope[])[0]
    : (data as WebhookEnvelope);

  const rawRecipes = entry?.recipes;

  if (!Array.isArray(rawRecipes) || rawRecipes.length < minRecipes) {
    return {
      ok: false,
      status: 502,
      error:
        Array.isArray(rawRecipes) && rawRecipes.length < minRecipes
          ? "Not enough recipes found — try a broader search."
          : "Invalid response from webhook",
      detail: data,
    };
  }

  for (const r of rawRecipes) {
    if (!r.id || !r.schema?.name) {
      return { ok: false, status: 502, error: "Invalid recipe data from webhook", detail: data };
    }
  }

  const recipes = rawRecipes.map(({ schema, ...rest }) => ({
    ...rest,
    metadata: { schema },
  }));

  return { ok: true, recipes };
}
