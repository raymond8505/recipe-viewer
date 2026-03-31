import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const webhookUrl = process.env.RESCRAPE_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

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
    webhookRes = await fetch(webhookUrl, {
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

  const updatedSchema = await webhookRes.json();

  const { error: updateError } = await supabase
    .from("recipes")
    .update({ metadata: { schema: updatedSchema } })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ schema: updatedSchema });
}
