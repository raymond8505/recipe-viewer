import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { env } from "@/env";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseClient();

  const { data: recipe, error: fetchError } = await supabase
    .from("recipes")
    .select("id, url, metadata")
    .eq("id", id)
    .single();

  if (fetchError || !recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  let webhookRes: Response;
  try {
    webhookRes = await fetch(env.RESCRAPE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: recipe.url }),
    });
  } catch {
    return NextResponse.json({ error: "Webhook unreachable" }, { status: 502 });
  }

  if (!webhookRes.ok) {
    return NextResponse.json({ error: "Webhook failed" }, { status: 502 });
  }

  const body = await webhookRes.json();
  const updatedSchema = body?.schema;
  if (!updatedSchema || typeof updatedSchema !== "object" || !updatedSchema.name) {
    return NextResponse.json({ error: "Invalid webhook response" }, { status: 502 });
  }

  return NextResponse.json({ schema: updatedSchema });
}
