import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getRecipeById } from "@/lib/recipes";
import { getRecipeNormalizedNutrition } from "@/lib/ingredients";
import { getFirstImage } from "@/lib/format";
import { getIsLoggedIn } from "@/lib/auth";
import { env } from "@/env";
import RecipeDetail from "@/components/RecipeDetail";

interface RecipePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: RecipePageProps): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getRecipeById(id);
  if (!recipe) return { title: "Recipe Not Found" };

  const { schema } = recipe.metadata;
  const image = getFirstImage(schema.image);
  const description = schema.description ?? undefined;

  return {
    title: schema.name,
    description,
    openGraph: {
      title: schema.name,
      description,
      ...(image && {
        images: [{ url: image }],
      }),
      type: "article",
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: schema.name,
      description,
      ...(image && { images: [image] }),
    },
  };
}

export default async function RecipePage({ params }: RecipePageProps) {
  const { id } = await params;
  const [recipe, isLoggedIn] = await Promise.all([getRecipeById(id), getIsLoggedIn()]);

  if (!recipe) {
    notFound();
  }

  // Normalized ingredient nutrition (null when the recipe was never normalized).
  // Preferred over the schema's own nutrition fields when fully covered.
  const normalizedNutrition = await getRecipeNormalizedNutrition(
    id,
    recipe.metadata.schema.recipeIngredient ?? [],
  );

  return (
    <RecipeDetail
      recipe={recipe}
      isLoggedIn={isLoggedIn}
      maxImageBytes={env.MAX_IMAGE_BYTES}
      normalizedNutrition={normalizedNutrition}
    />
  );
}
