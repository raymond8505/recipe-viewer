/**
 * UI-only editable shapes for the structured recipe editor.
 *
 * Every node carries a stable `id` (from `nanoid`) so dnd-kit sortable ids and
 * React keys survive reordering. These types are never persisted: the
 * converters in `src/lib/format.ts` (`ingredientsToEditable` /
 * `editableToIngredientInput`, `instructionsToEditable` /
 * `editableToInstructions`) are the only translation in and out.
 *
 * Both trees mirror the recipe's own groups one to one —
 * `RecipeIngredientGroup[]` and `RecipeInstructionGroup[]`; a null heading is
 * a nameless group.
 */

/**
 * A single ingredient row — one free-text input ("1 tsp cumin").
 *
 * `recipeIngredientId` is the `recipe_ingredients` row this line IS, carried
 * through the draft so a save hands it back and the row — with the catalog
 * association a user curated on it — survives the edit. Absent on a line the
 * user just added, which is how the write path knows to mint a row.
 */
export interface EditableIngredient {
  id: string;
  recipeIngredientId?: string;
  name: string;
}

/** A single instruction step: body text plus an optional co-dependent
 *  timer (`name` + `minutes`/`seconds`, which map to `RecipeStep.name` /
 *  `seconds`). Duration is minutes:seconds — cook-mode timers run in
 *  seconds, and step timers are sub-hour; `minutes` may exceed 59. */
export interface EditableStep {
  id: string;
  text: string;
  name: string;
  minutes: number;
  seconds: number;
}

/**
 * A draggable group of items. `heading === null` is the implicit
 * ungrouped/top-level section: it always exists, is never deletable, and has
 * no drag handle. A non-null `heading` maps to the group's `name` on
 * conversion.
 */
export interface EditableGroup<T> {
  id: string;
  heading: string | null;
  items: T[];
}

export type EditableIngredients = EditableGroup<EditableIngredient>[];
export type EditableInstructions = EditableGroup<EditableStep>[];
