import { NextResponse } from "next/server";
import { env } from "@/env";
import { consumeRequestToken } from "@/lib/apiAuth";
import { requireSessionOrRecipeToken } from "@/lib/api/guard";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  StorageUploadError,
  uploadRecipeImage,
} from "@/lib/storage";
import { getRecipeById, updateRecipeRow } from "@/lib/recipes";

export const runtime = "nodejs";

export const POST = requireSessionOrRecipeToken(
  async (req: Request, { params }: RouteContext<"/api/recipes/[id]/upload-image">) => {
    const { id } = await params;

    const recipe = await getRecipeById(id);
    if (!recipe) {
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
      return NextResponse.json({ error: "Missing file field" }, { status: 400 });
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

    // Default-on: point metadata.schema.image at the uploaded file, matching the
    // MCP upload_recipe_image tool's direct paths. Callers opt out with
    // updateSchema=false (or "0") — the web UI does this because it has a human
    // verification step and folds the returned URL into its own full-schema save.
    const rawUpdateSchema = form.get("updateSchema");
    const updateSchema = rawUpdateSchema !== "false" && rawUpdateSchema !== "0";

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
      // Spend the one-shot upload token now that the upload has fully succeeded.
      // Left out of the 502 partial-failure path above so a failed row update
      // keeps the token usable for a retry.
      await consumeRequestToken(req);
      return NextResponse.json({ image });
    } catch (err) {
      if (err instanceof StorageUploadError) {
        const status = err.kind === "unsupported_type" ? 415 : 502;
        return NextResponse.json({ error: err.detail }, { status });
      }
      return NextResponse.json({ error: "Upload failed" }, { status: 502 });
    }
  },
);
