import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getRecipeById } from "@/lib/recipes";
import { getFirstImage } from "@/lib/format";
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
  const recipe = await getRecipeById(id);

  if (!recipe) {
    notFound();
  }

  return <RecipeDetail recipe={recipe} />;
}
