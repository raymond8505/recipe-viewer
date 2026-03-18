import Image from "next/image";
import Link from "next/link";
import type { RecipeRow } from "@/types/recipe";
import { formatDuration, getFirstImage, toArray } from "@/lib/format";

interface RecipeCardProps {
  recipe: RecipeRow;
}

export default function RecipeCard({ recipe }: RecipeCardProps) {
  const { metadata: { schema }, id } = recipe;
  const image = getFirstImage(schema.image);
  const totalTime = formatDuration(schema.totalTime ?? schema.cookTime);
  const categories = toArray(schema.recipeCategory);

  return (
    <Link
      href={`/recipes/${id}`}
      className="group flex flex-col rounded-2xl overflow-hidden border border-gray-200 bg-white hover:shadow-lg transition-shadow duration-200"
    >
      <div className="relative w-full aspect-video bg-gray-100">
        {image ? (
          <Image
            src={image}
            alt={schema.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-200"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300">
            <svg
              className="w-12 h-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </div>

      <div className="flex flex-col flex-1 p-4 gap-2">
        <h2 className="font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:text-orange-600 transition-colors">
          {schema.name}
        </h2>

        {schema.description && (
          <p className="text-sm text-gray-500 line-clamp-2">
            {schema.description}
          </p>
        )}

        <div className="mt-auto flex items-center gap-3 text-xs text-gray-400 pt-2">
          {totalTime && (
            <span className="flex items-center gap-1">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {totalTime}
            </span>
          )}
          {categories[0] && (
            <span className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full font-medium">
              {categories[0]}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
