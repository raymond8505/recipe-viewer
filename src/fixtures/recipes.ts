import type { RecipeRow } from "@/types/recipe";

// These are HYDRATED rows — what every consumer above src/lib/recipes.ts sees.
// The time columns and their schema.{prepTime,cookTime,totalTime} counterparts
// therefore agree here, because hydrateTimes has notionally already run. A raw
// post-0019 database row would carry the columns and NO schema time keys; only
// repo-layer tests should model that.
export const recipeFixtures: RecipeRow[] = [
  {
    id: "7cd24839-e518-4c6b-92c4-62171165c332",
    url: "https://new.raymonds.recipes/recipes/chorizo-tofu-marinade",
    source: "new.raymonds.recipes",
    status: "published",
    prep_time: 5,
    cook_time: null,
    total_time: 5,
    metadata: {
      schema: {
        name: "Chorizo Tofu Marinade",
        description:
          "A thick chorizo-style marinade paste. Built around ancho chile, smoked paprika, and cumin, with tomato paste carrying colour and umami in place of pork fat.",
        image:
          "https://xonkmdhnjpjkapnsmltu.supabase.co/storage/v1/object/recipes/chorizo-crumbled-tofu.png",
        prepTime: "PT5M",
        totalTime: "PT5M",
        recipeYield: "Enough for one 350g brick of tofu",
        recipeCuisine: "Mexican-Inspired",
        recipeCategory: "Marinade",
        nutrition: {
          calories: "276",
          fatContent: "28.6g",
          proteinContent: "1.3g",
          carbohydrateContent: "6.1g",
          servingSize: "full batch",
        },
      },
    },
  },
  {
    id: "2c2015a8-6e10-4f85-9ee6-261320309d3c",
    url: "https://new.raymonds.recipes/recipes/black-bean-mushroom-enchiladas-charred-tomatillo",
    source: "new.raymonds.recipes",
    status: "published",
    prep_time: 20,
    cook_time: 35,
    total_time: 55,
    metadata: {
      schema: {
        name: "Black Bean & Mushroom Enchiladas with Charred Tomatillo Sauce",
        description:
          "Six corn tortillas filled with golden cremini mushrooms and black beans, rolled and baked under a charred tomatillo sauce inspired by salsa cruda — bright and tangy with scotch bonnet heat.",
        image:
          "https://xonkmdhnjpjkapnsmltu.supabase.co/storage/v1/object/recipes/1776712239492.png",
        prepTime: "PT20M",
        cookTime: "PT35M",
        totalTime: "PT55M",
        recipeYield: "3 servings",
        recipeCuisine: "Mexican",
        recipeCategory: "Main",
        datePublished: "2026-04-20",
        nutrition: {
          calories: "558",
          proteinContent: "27g",
          carbohydrateContent: "59g",
          fatContent: "26g",
          fiberContent: "11g",
          sodiumContent: "510mg",
          servingSize: "2 enchiladas",
        },
      },
    },
  },
  {
    id: "f0d5dbff-e30b-41af-a253-4d2e2decf4b6",
    url: "https://new.raymonds.recipes/recipes/thai-curry-chicken-meatballs",
    source: "new.raymonds.recipes",
    status: "published",
    prep_time: 20,
    cook_time: 30,
    total_time: 50,
    metadata: {
      schema: {
        name: "Thai Curry Chicken Meatballs",
        description:
          "Thai-spiced chicken meatballs simmered in a coconut red curry sauce. Coconut milk reduced to 300ml; brown sugar over honey; peanut butter swapped for crushed peanut garnish.",
        image:
          "https://xonkmdhnjpjkapnsmltu.supabase.co/storage/v1/object/recipes/thai-curry-chicken-meatballs-v2.png",
        prepTime: "PT20M",
        cookTime: "PT30M",
        totalTime: "PT50M",
        recipeYield: "4 servings",
        recipeCuisine: "Thai",
        recipeCategory: "Main Course",
        datePublished: "2026-01-09",
        recipeIngredient: [
          { name: "1 lb ground chicken", group: "Meatballs" },
          { name: "3 cloves garlic, minced", group: "Meatballs" },
          { name: "1 tbsp fish sauce", group: "Meatballs" },
          { name: "1/4 cup panko breadcrumbs", group: "Meatballs" },
          { name: "1 egg", group: "Meatballs" },
          { name: "300 ml full-fat coconut milk", group: "Curry sauce" },
          { name: "2 tbsp red curry paste", group: "Curry sauce" },
          { name: "1 tbsp brown sugar", group: "Curry sauce" },
          { name: "1 tbsp lime juice", group: "Curry sauce" },
          { name: "3-5 thai basil leaves, torn", group: "Curry sauce" },
          { name: "1/4 cup crushed peanuts, for garnish", group: "Garnish" },
          { name: "cilantro, to taste", group: "Garnish" },
        ],
        recipeInstructions: [
          {
            "@type": "HowToSection",
            name: "Make the meatballs",
            itemListElement: [
              { "@type": "HowToStep", text: "Combine chicken, garlic, fish sauce, panko, and egg in a bowl. Mix until just combined — overworking makes them tough." },
              { "@type": "HowToStep", text: "Form into 16 meatballs, roughly 1 inch across. Refrigerate for 10 minutes to firm up." },
              { "@type": "HowToStep", text: "Heat a tablespoon of oil in a heavy skillet over medium-high. Brown the meatballs on all sides, about 6 minutes total. Remove and set aside." },
            ],
          },
          {
            "@type": "HowToSection",
            name: "Build the curry",
            itemListElement: [
              { "@type": "HowToStep", text: "In the same skillet, fry the red curry paste in any residual fat for 30 seconds until fragrant." },
              { "@type": "HowToStep", text: "Pour in the coconut milk and whisk until smooth. Add brown sugar and lime juice." },
              { "@type": "HowToStep", text: "Return the meatballs to the pan. Simmer for 15 minutes, turning halfway, until the sauce coats the back of a spoon and the meatballs are cooked through." },
              { "@type": "HowToStep", text: "Tear in the basil at the end. Serve over jasmine rice topped with crushed peanuts and cilantro." },
            ],
          },
        ],
        notes:
          "Coconut milk brand matters: Aroy-D and Chaokoh emulsify cleanly. Lighter supermarket brands break the sauce. If your basil is wilting, save it for garnish instead of stirring in.",
        nutrition: {
          calories: "828",
          proteinContent: "37.8g",
          carbohydrateContent: "85.2g",
          fatContent: "36.2g",
          sodiumContent: "1200mg",
          servingSize: "1 serving",
        },
      },
    },
  },
  {
    id: "35f54942-4ffc-466a-97bd-3ef29b1edaf0",
    url: "https://new.raymonds.recipes/recipes/strawberry-oat-bars",
    source: "new.raymonds.recipes",
    status: "published",
    prep_time: 40,
    cook_time: 35,
    total_time: 240,
    metadata: {
      schema: {
        name: "Strawberry Oat Bars",
        description:
          "Modified oat bars with strawberry chia jam filling, optimized for structural integrity and caloric efficiency.",
        image:
          "https://xonkmdhnjpjkapnsmltu.supabase.co/storage/v1/object/recipes/strawberry-oat-bars.png",
        prepTime: "PT40M",
        cookTime: "PT35M",
        totalTime: "PT4H",
        recipeYield: "16 bars",
        recipeCuisine: "American",
        recipeCategory: "Breakfast",
        datePublished: "2026-02-12",
        nutrition: {
          calories: "211",
          proteinContent: "6.1g",
          carbohydrateContent: "23.8g",
          fatContent: "10.8g",
          fiberContent: "4.9g",
          sodiumContent: "73mg",
          servingSize: "1 bar",
        },
      },
    },
  },
  {
    id: "c3d618df-d9eb-40a0-98f9-ad193fc844b2",
    url: "https://new.raymonds.recipes/recipes/quick-yakisoba-sauce",
    source: "new.raymonds.recipes",
    status: "published",
    prep_time: 5,
    cook_time: null,
    total_time: 5,
    metadata: {
      schema: {
        name: "Quick Yakisoba Sauce",
        description:
          "A versatile umami-forward sauce base. Layered flavors from soy, Worcestershire, hoisin, and garlic chili with a light sweetness from sugar and ketchup.",
        image:
          "https://xonkmdhnjpjkapnsmltu.supabase.co/storage/v1/object/recipes/quick-yakisoba-sauce.png",
        prepTime: "PT5M",
        totalTime: "PT5M",
        recipeYield: "2 servings",
        recipeCuisine: "Asian",
        recipeCategory: "Sauce",
        datePublished: "2026-02-25",
        nutrition: {
          calories: "82",
          proteinContent: "1g",
          carbohydrateContent: "18g",
          fatContent: "0.5g",
          sodiumContent: "600mg",
          servingSize: "1 serving",
        },
      },
    },
  },
];

export function makeRecipe(
  id: string,
  name: string,
  overrides: Partial<RecipeRow> = {},
): RecipeRow {
  return {
    id,
    url: `https://new.raymonds.recipes/recipes/${id}`,
    source: "new.raymonds.recipes",
    status: "published",
    prep_time: null,
    cook_time: null,
    total_time: null,
    metadata: { schema: { name } },
    ...overrides,
  };
}
