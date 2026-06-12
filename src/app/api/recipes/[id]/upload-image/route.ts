import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  StorageUploadError,
  uploadRecipeImage,
} from "@/lib/storage";

export const runtime = "nodejs";

const MAX_BYTES = 4_000_000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = getSupabaseClient();

  const { data: recipe, error } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", id)
    .single();

  if (error || !recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing file field" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_BYTES} bytes` },
      { status: 413 },
    );
  }

  if (!ALLOWED_IMAGE_CONTENT_TYPES.includes(file.type as never)) {
    return NextResponse.json(
      { error: `Unsupported content type: ${file.type}` },
      { status: 415 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const image = await uploadRecipeImage(id, bytes, file.type);
    return NextResponse.json({ image });
  } catch (err) {
    if (err instanceof StorageUploadError) {
      const status = err.kind === "unsupported_type" ? 415 : 502;
      return NextResponse.json({ error: err.detail }, { status });
    }
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }
}
