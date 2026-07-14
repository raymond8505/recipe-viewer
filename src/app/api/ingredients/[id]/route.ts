import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guard";
import { generateEmbedding } from "@/lib/embedding";
import {
  IngredientRepoError,
  deleteIngredientRow,
  updateIngredientRow,
  type UpdateIngredientPatch,
} from "@/lib/ingredients";
import { ingredientUpdateInputSchema } from "@/lib/schemas/ingredient";

function toErrorResponse(err: IngredientRepoError): Response {
  switch (err.kind) {
    case "not_found":
      return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
    case "conflict":
      return NextResponse.json(
        { error: "An ingredient with that name already exists" },
        { status: 409 },
      );
    default:
      return NextResponse.json({ error: "Failed to save ingredient" }, { status: 500 });
  }
}

export const PATCH = requireSession(
  async (req: Request, { params }: RouteContext<"/api/ingredients/[id]">) => {
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const parsed = ingredientUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ingredient patch" }, { status: 400 });
    }

    const patch: UpdateIngredientPatch = { ...parsed.data };
    // The embedding IS the name (that's what matching searches), so a rename
    // must re-embed. Best-effort: on null the repo keeps the old vector, which
    // still points at the previous name — re-saving the name retries.
    if (parsed.data.name !== undefined) {
      patch.embedding = await generateEmbedding(parsed.data.name);
    }

    try {
      const row = await updateIngredientRow(id, patch);
      return NextResponse.json(row);
    } catch (err) {
      if (err instanceof IngredientRepoError) return toErrorResponse(err);
      throw err;
    }
  },
);

export const DELETE = requireSession(
  async (_req: Request, { params }: RouteContext<"/api/ingredients/[id]">) => {
    const { id } = await params;

    try {
      await deleteIngredientRow(id);
      // Referencing recipe_ingredients rows keep their parsed data; their
      // ingredient_id nulls out via the FK (see db/migrations/0003).
      return NextResponse.json({ deleted: true });
    } catch (err) {
      if (err instanceof IngredientRepoError) return toErrorResponse(err);
      throw err;
    }
  },
);
