/**
 * UI-only editable shapes for the structured recipe editor.
 *
 * CRITICAL: groups are a UI construct that exists ONLY in editor draft state.
 * The stored schema has no group type — ingredients are a flat
 * `Array<string | RecipeIngredient>` whose membership is carried on each
 * ingredient's own `group` field, and instructions are a flat
 * `Array<HowToStep | HowToSection>`. The converters in `src/lib/format.ts`
 * (`schemaToEditable*` / `editable*ToSchema`) are the ONLY place this
 * UI-tree ⇄ flat-with-`group` translation happens. Never persist these types.
 *
 * Every node carries a stable `id` (from `nanoid`) so dnd-kit sortable ids and
 * React keys survive reordering.
 */

/** A single ingredient row — one free-text input ("1 tsp cumin"). */
export interface EditableIngredient {
  id: string;
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
 * no drag handle. A non-null `heading` maps to the ingredient `group` string /
 * `HowToSection.name` on conversion.
 */
export interface EditableGroup<T> {
  id: string;
  heading: string | null;
  items: T[];
}

export type EditableIngredients = EditableGroup<EditableIngredient>[];
export type EditableInstructions = EditableGroup<EditableStep>[];

/**
 * UI-only editable form of `recipeYield`. All fields are raw input strings;
 * `src/lib/format.ts`'s `schemaToEditableYield` / `editableYieldToSchema`
 * translate to/from the stored `QuantitativeValue`. `servings` + `unit` are the
 * serving count and its label (e.g. "4" + "kebabs"); `weight` + `weightUnit`
 * are the optional raw weight/volume (→ `valueReference`, e.g. "454" + "g")
 * that drives the per-serving basis in the nutrition panel. Blank `servings`
 * means no yield.
 */
export interface EditableYield {
  servings: string;
  unit: string;
  weight: string;
  weightUnit: string;
}
