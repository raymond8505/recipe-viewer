/**
 * UI-only editable shapes for the structured recipe editor.
 *
 * Every node carries a stable `id` (from `nanoid`) so dnd-kit sortable ids and
 * React keys survive reordering. These types are never persisted: the
 * converters in `src/lib/format.ts` (`ingredientsToEditable` /
 * `editableToIngredientInput`, `schemaToEditableInstructions` /
 * `editableInstructionsToSchema`) are the only translation in and out.
 *
 * Ingredient groups mirror the recipe's own `RecipeIngredientGroup[]` one to
 * one. Instruction groups do not: the stored instructions are a flat
 * `Array<HowToStep | HowToSection>`, and the null-heading group collects the
 * top-level steps.
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
 *  timer (`name` + `minutes`/`seconds`, which map to `HowToStep.name` /
 *  `timeRequired`). Duration is minutes:seconds — cook-mode timers run in
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
 * no drag handle. A non-null `heading` maps to the ingredient group's `name` /
 * `HowToSection.name` on conversion.
 */
export interface EditableGroup<T> {
  id: string;
  heading: string | null;
  items: T[];
}

export type EditableIngredients = EditableGroup<EditableIngredient>[];
export type EditableInstructions = EditableGroup<EditableStep>[];
