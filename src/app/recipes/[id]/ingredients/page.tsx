import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getRecipeById } from "@/lib/recipes";
import { getIngredientsByIds, getRecipeIngredients } from "@/lib/ingredients";
import { getIsLoggedIn } from "@/lib/auth";
import NutritionDetail from "@/components/ingredients/NutritionDetail";

interface RecipeIngredientsPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: RecipeIngredientsPageProps): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getRecipeById(id);
  if (!recipe) return { title: "Recipe Not Found" };
  return { title: `${recipe.metadata.schema.name} — Ingredients` };
}

// Login-gated curation surface for a recipe's normalized ingredient layer.
// The data-plane routes are session-only regardless (routePolicy), so this
// gate is UX, not the security boundary.
export default async function RecipeIngredientsPage({
  params,
}: RecipeIngredientsPageProps) {
  const { id } = await params;
  const [recipe, isLoggedIn] = await Promise.all([getRecipeById(id), getIsLoggedIn()]);

  if (!recipe) {
    notFound();
  }

  if (!isLoggedIn) {
    return (
      <section className="py-16 text-center">
        <h1 className="text-3xl mb-3">Nutrition Breakdown</h1>
        <p className="text-muted-foreground">
          Sign in to manage this recipe&apos;s normalized ingredients.
        </p>
      </section>
    );
  }

  const rows = await getRecipeIngredients(id);
  const ingredientIds = [
    ...new Set(rows.map((r) => r.ingredient_id).filter((x): x is string => x != null)),
  ];
  const ingredients = await getIngredientsByIds(ingredientIds);

  const { schema } = recipe.metadata;

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm">
          <Link href={`/recipes/${id}`} className="text-brand hover:underline">
            ← {schema.name}
          </Link>
        </p>
        <h1 className="text-3xl mt-1">Nutrition Breakdown</h1>
        <p className="text-muted-foreground mt-1">
          Each line&apos;s contribution to the recipe, computed from the ingredient
          catalog (per 100 g × parsed amount). Fix a wrong match by picking a
          different catalog ingredient.
        </p>
      </div>
      <NutritionDetail
        recipeId={id}
        schemaIngredients={schema.recipeIngredient ?? []}
        recipeYield={schema.recipeYield}
        initialRows={rows}
        initialIngredients={ingredients}
      />
    </section>
  );
}
