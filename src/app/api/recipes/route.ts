import { getRecipes } from "@/lib/recipes";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const query = searchParams.get("q") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 24)));
  const source = searchParams.get("source") ?? undefined;

  const result = await getRecipes({ query, page, limit, source });

  return Response.json(result);
}
