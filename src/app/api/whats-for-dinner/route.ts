import { NextResponse } from "next/server";
import { callRecipeWebhook } from "@/lib/webhook";
import { env } from "@/env";
import { requireSession } from "@/lib/api/guard";

// Logged-in-only: proxies a paid LLM decision webhook. See routePolicy.ts.
export const POST = requireSession(async (req: Request) => {
  const body = await req.json().catch(() => null);
  if (!body?.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "A prompt is required" }, { status: 400 });
  }

  const choices = Array.isArray(body.choices) ? body.choices : [];

  const result = await callRecipeWebhook({
    url: env.WHATS_FOR_DINNER_WEBHOOK_URL,
    payload: { prompt: body.prompt, choices },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.detail !== undefined && { webhookResponse: result.detail }) },
      { status: result.status },
    );
  }

  return NextResponse.json({ recipes: result.recipes });
});
