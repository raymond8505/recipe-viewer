# Cooking Mode

## Cooking Mode is touch-first

Cooking mode is designed for use on a tablet or phone while actively cooking — often with wet or dirty hands.

- All interactive elements must have large tap targets (minimum 44×44px)
- Do not rely on hover states for anything functional (touch devices have no hover)
- Avoid small controls or precision-required interactions
- Prefer bold visual affordances: large buttons, visible drag handles, high-contrast feedback
- Cursor styles (`cursor-pointer`, `cursor-ns-resize`, etc.) are fine for desktop polish but are not the primary affordance signal

## Meal Mode

Cook mode supports grouping multiple recipes into a "meal" session. State lives in `CookingMode.tsx` as plain `useState` — no context or hook.

**Key invariants:**
- `mealRecipes[0]` is always the primary recipe and cannot be removed
- `activeSchema = scalables.get(mealRecipes[activeIndex].id).schema` — every `ScalableRecipe` in `scalables` is built from a **composed** schema: the primary from the `schema` state (seeded by `composeRecipeSchema(recipe)`, overridable by the window API), each added recipe from `composeRecipeSchema(newRecipe)` in `handleAddToMeal`. `activeSchema` is what drives ingredients/instructions/notes rendering. A `RecipeRow`'s `metadata.schema` cannot render those — since `db/migrations/0016` it holds no lines or steps
- `useScaling` is called once on the primary recipe's `recipeYield`; non-primary recipes get `scale={1}` with no `onScaleChange` — scaling is intentionally primary-only for now
- All timers (primary + added recipes) land in a single localStorage bucket keyed by the primary recipe's URL hash. Timers from added recipes are seeded imperatively in `handleAddToMeal` and are **not** deduplicated — if a recipe is added a second time its timers are re-seeded

**Step completion** is tracked per-recipe via `completedStepsMap: Map<recipe.id, Set<string>>`. Step keys (`"i-j"` or `"i"`) are only unique within a recipe's own bucket.

**MealTabs pattern:** closable tabs use two adjacent `<button>` elements (tab name + ×) inside a flex `<div>` — NOT a button inside a button (invalid HTML). The × has `tabIndex={-1}` and is outside the roving tabindex cycle. All tab buttons share `aria-controls="meal-recipe-panel"` pointing to the single panel ID in CookingMode.

**MealSearch** is always rendered (no toggle). Click-outside clears query; ArrowDown from input moves focus to first result; ArrowUp from first result returns to input.

## Shopping List

Ingredients in both `CookingMode` and `RecipeDetail` are tappable checkboxes that build a shopping list, copied to clipboard as newline-separated text.

**State:**
- `CookingMode`: `Set<string>` keyed as `"${recipeId}::${ingredientText}"` — shared across all meal recipes in a session
- `RecipeDetail`: `Set<string>` keyed by bare ingredient text — separate, no cross-mode sharing

**Copy output reflects the current ingredient scale.** Both handlers iterate `ScalableRecipe.ingredients` and render each line through `formatScaledIngredient` (`src/lib/ScalableRecipe.ts`) — scaling a recipe is a deliberate act, and the shopper needs the amount to actually buy. (This reverses the earlier rule that copy was always raw text.)

`formatScaledIngredient` returns `original` verbatim in two cases: unparseable lines ("salt to taste"), and lines still at their base amount. The second guard is load-bearing — rebuilding is not an identity even at 1×, since `formatParsedAmount` renders ½ as "0.5".

The unit in a copied line is the recipe's own wording, preserved as `ParsedIngredient.unitText` (the canonical `unit` key's `display` is singular, so rebuilding from it would yield "4 cup flour"). Copy deliberately does **not** reproduce `IngredientItem`'s volume-threshold promotion (8 tsp → "2.67 tbsp") or its per-item unit dropdown — both live in that component's local `selectedUnit` state.

**Selection keys stay raw `ing.original` text**, unscaled — a scale-stable identity, so a selection survives the user changing the scale afterwards. Only the copy output scales.

**Primary recipe copy must reflect live `schema`, not `mealRecipes[0].metadata.schema`** — preserves window API overrides. Now satisfied structurally rather than by branching on `r.id`: the effect that rebuilds `scalables` keys the primary off `schema`, so iterating `scalables` is already correct. Don't reintroduce a `metadata.schema` read here — beyond losing the override, it would copy nothing: the blob has carried no ingredient lines since `db/migrations/0016` (or, on a backfilled row, a frozen pre-migration copy of them).
