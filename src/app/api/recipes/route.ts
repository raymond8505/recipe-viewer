import { getRecipes } from "@/lib/recipes";
import { getIsLoggedIn } from "@/lib/auth";

export async function GET(request: Request) {
  if (request.headers.get("x-requested-by") !== "recipe-viewer") {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);

  const query = searchParams.get("q") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 24)));
  const source = searchParams.get("source") ?? undefined;
  const isLoggedIn = await getIsLoggedIn();

  const result = await getRecipes({ query, page, limit, source, isLoggedIn });

  return Response.json(result);
}
