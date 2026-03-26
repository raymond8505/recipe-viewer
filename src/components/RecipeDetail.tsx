"use client";

import Image from "next/image";
import type { RecipeRow, HowToStep, HowToSection } from "@/types/recipe";
import {
  formatDuration,
  formatDate,
  getFirstImage,
  toArray,
  groupIngredients,
  getIngredientText,
  toSchemaOrgJsonLd,
} from "@/lib/format";
import { useScaling } from "@/hooks/useScaling";
import CookingModeButton from "./CookingModeButton";
import IngredientItem from "./IngredientItem";
import ServingsControl from "./ServingsControl";
import NutritionPanel from "./NutritionPanel";

interface RecipeDetailProps {
  recipe: RecipeRow;
}

export default function RecipeDetail({ recipe }: RecipeDetailProps) {
  const { metadata: { schema } } = recipe;
  const image = getFirstImage(schema.image);
  const prepTime = formatDuration(schema.prepTime);
  const cookTime = formatDuration(schema.cookTime);
  const totalTime = formatDuration(schema.totalTime);
  const categories = toArray(schema.recipeCategory);
  const { scale, servings, originalServings, setScale, setServings } = useScaling(schema.recipeYield);

  return (
    <article className="max-w-3xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map((cat) => (
            <span
              key={cat}
              className="px-3 py-1 bg-orange-50 text-orange-600 text-sm font-medium rounded-full"
            >
              {cat}
            </span>
          ))}
          {schema.recipeCuisine && (
            <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm font-medium rounded-full">
              {schema.recipeCuisine}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 mb-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
            {schema.name}
          </h1>
          <CookingModeButton recipe={recipe} />
        </div>

        {schema.description && (
          <p className="text-gray-600 text-lg leading-relaxed">
            {schema.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-sm text-gray-500">
          {schema.author?.name && <span>By {schema.author.name}</span>}
          {schema.datePublished && (
            <span>{formatDate(schema.datePublished)}</span>
          )}
        </div>
      </header>

      {/* Image */}
      {image && (
        <div className="w-full rounded-2xl overflow-hidden mb-8 bg-gray-100">
          <Image
            src={image}
            alt={schema.name}
            width={0}
            height={0}
            sizes="(max-width: 768px) 100vw, 768px"
            className="w-full h-auto"
            priority
          />
        </div>
      )}

      {/* Time / Yield stats */}
      {(prepTime || cookTime || totalTime || schema.recipeYield) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 p-4 bg-orange-50 rounded-2xl">
          {prepTime && <Stat label="Prep time" value={prepTime} />}
          {cookTime && <Stat label="Cook time" value={cookTime} />}
          {totalTime && <Stat label="Total time" value={totalTime} />}
          {schema.recipeYield && (
            servings != null
              ? <ServingsControl servings={servings} onChange={setServings} />
              : <Stat label="Servings" value={Array.isArray(schema.recipeYield) ? schema.recipeYield[0] : schema.recipeYield} />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
        {/* Ingredients */}
        {schema.recipeIngredient && schema.recipeIngredient.length > 0 && (
          <div className="sm:col-span-1">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Ingredients
            </h2>
            {groupIngredients(schema.recipeIngredient).map(({ heading, items }, gi) => (
              <div key={gi} className={gi > 0 ? "mt-4" : ""}>
                {heading && (
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-2">
                    {heading}
                  </h3>
                )}
                <ul className="space-y-2">
                  {items.map((ingredient, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                      <IngredientItem ingredient={getIngredientText(ingredient)} scale={scale} onScaleChange={setScale} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Instructions */}
        {schema.recipeInstructions && schema.recipeInstructions.length > 0 && (
          <div className="sm:col-span-2">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Instructions
            </h2>
            {schema.recipeInstructions[0]["@type"] === "HowToSection" ? (
              <div className="space-y-6">
                {(schema.recipeInstructions as HowToSection[]).map((section, i) => (
                  <div key={i}>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">
                      {section.name}
                    </h3>
                    <ol className="space-y-3">
                      {section.itemListElement.map((step, j) => (
                        <li key={j} className="flex gap-4">
                          <span className="shrink-0 w-7 h-7 rounded-full bg-orange-500 text-white text-sm font-bold flex items-center justify-center">
                            {j + 1}
                          </span>
                          <p className="text-gray-700 leading-relaxed pt-0.5">
                            {step.text}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            ) : (
              <ol className="space-y-4">
                {(schema.recipeInstructions as HowToStep[]).map((step, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="shrink-0 w-7 h-7 rounded-full bg-orange-500 text-white text-sm font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <p className="text-gray-700 leading-relaxed pt-0.5">
                      {step.text}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      {schema.notes && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Notes</h2>
          <p className="text-gray-700 leading-relaxed whitespace-pre-line">{schema.notes}</p>
        </div>
      )}

      {/* Nutrition */}
      {schema.nutrition && <NutritionPanel nutrition={schema.nutrition} totalServings={originalServings} />}

      {/* JSON-LD — Schema.org-compliant only; escape </script> sequences to prevent tag injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(toSchemaOrgJsonLd(schema), null, 2).replace(/</g, "\\u003c") }}
      />
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function NutritionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 text-center">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="font-medium text-gray-900">{value}</p>
    </div>
  );
}

