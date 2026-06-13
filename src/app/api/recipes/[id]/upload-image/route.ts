import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { env } from "@/env";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  StorageUploadError,
  uploadRecipeImage,
} from "@/lib/storage";
import { updateRecipeRow } from "@/lib/recipes";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: RouteContext<"/api/recipes/[id]/upload-image">,
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

  if (file.size > env.MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${env.MAX_IMAGE_BYTES} bytes` },
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

  // Opt-in: also point metadata.schema.image at the uploaded file, like the
  // MCP upload_recipe_image tool does. The web UI omits this and folds the
  // returned URL into its own full-schema save instead.
  const updateSchema = form.get("updateSchema") === "true";

  try {
    const image = await uploadRecipeImage(id, bytes, file.type);
    if (updateSchema) {
      try {
        await updateRecipeRow(id, { schema: { image } });
      } catch {
        return NextResponse.json(
          {
            error: "Image uploaded to storage but updating the recipe failed",
            image,
          },
          { status: 502 },
        );
      }
    }
    return NextResponse.json({ image });
  } catch (err) {
    if (err instanceof StorageUploadError) {
      const status = err.kind === "unsupported_type" ? 415 : 502;
      return NextResponse.json({ error: err.detail }, { status });
    }
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }
}
