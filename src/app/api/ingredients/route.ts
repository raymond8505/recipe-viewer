import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guard";
import { generateEmbedding } from "@/lib/embedding";
import {
  IngredientRepoError,
  createIngredientRow,
  getIngredients,
} from "@/lib/ingredients";
import {
  ingredientCreateInputSchema,
  ingredientListQuerySchema,
} from "@/lib/schemas/ingredient";

export const GET = requireSession(async (req: Request) => {
  const url = new URL(req.url);
  const parsed = ingredientListQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { q, page, limit } = parsed.data;
  const result = await getIngredients({ query: q, page, limit });
  return NextResponse.json(result);
});

export const POST = requireSession(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = ingredientCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ingredient" }, { status: 400 });
  }

  // Manual entries need an embedding to be matchable, and the column is NOT
  // NULL (db/migrations/0006), so a failed embedding can't produce a row.
  // Surface it as a transient failure the client can retry rather than a 500.
  const embedding = await generateEmbedding(parsed.data.name);
  if (!embedding) {
    return NextResponse.json(
      { error: "Could not generate an embedding for this ingredient — try again shortly." },
      { status: 503 },
    );
  }

  try {
    const row = await createIngredientRow({ ...parsed.data, embedding });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof IngredientRepoError) {
      return err.kind === "conflict"
        ? NextResponse.json(
            { error: "An ingredient with that name already exists" },
            { status: 409 },
          )
        : NextResponse.json({ error: "Failed to create ingredient" }, { status: 500 });
    }
    throw err;
  }
});
