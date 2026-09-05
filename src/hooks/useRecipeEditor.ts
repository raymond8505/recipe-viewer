import { useCallback, useMemo, useState } from "react";
import type { SchemaRecipe } from "@/types/recipe";
import type {
  EditableIngredients,
  EditableInstructions,
} from "@/types/editor";
import {
  editableIngredientsToSchema,
  editableInstructionsToSchema,
  isoToMinutes,
  minutesToIso,
  parseMinutesInput,
  schemaToEditableIngredients,
  schemaToEditableInstructions,
} from "@/lib/format";
import { applyServings, parseServings } from "@/lib/units";

export type EditState = "idle" | "editing" | "saving" | "error";

/** The editable form fields. Scalar inputs are strings; ingredients and
 *  instructions are the structured editor trees (groups of rows/steps). */
export interface EditDraft {
  name: string;
  url: string;
  description: string;
  ingredients: EditableIngredients;
  instructions: EditableInstructions;
  notes: string;
  status: string;
  /** Provenance: an origin domain, or "custom" for a recipe authored here.
   *  Read by isOwnRecipe to decide whether Re-scrape applies. */
  source: string;
  /** Base servings as raw input text; parsed (integer >= 1) on save. */
  servings: string;
  /** Persisted recipe times as raw input text (minutes); parsed by
   *  `parseMinutesInput` on save. Blank clears the time outright. */
  prepTime: string;
  cookTime: string;
  totalTime: string;
}

/** The row-level (non-schema) fields the editor seeds from. Passed as an object
 *  rather than positionally: they are all plain strings, so a positional list
 *  would let a caller swap two of them with no type error. */
export interface EditRowFields {
  status: string;
  url: string;
  source: string;
}

const EMPTY_DRAFT: EditDraft = {
  name: "",
  url: "",
  description: "",
  ingredients: [],
  instructions: [],
  notes: "",
  status: "",
  source: "",
  servings: "",
  prepTime: "",
  cookTime: "",
  totalTime: "",
};

export interface UseRecipeEditor {
  draft: EditDraft;
  editState: EditState;
  isEditing: boolean;
  isSaving: boolean;
  /** Step ids where exactly one of `name` / time is set — both must be set or
   *  both blank (co-dependency). A non-empty set blocks saving. */
  instructionErrors: Set<string>;
  /** False while a co-dependency violation exists; drives the Save button. */
  canSave: boolean;
  /** Shallow-merge a partial draft (drives every controlled input's onChange). */
  patch: (partial: Partial<EditDraft>) => void;
  /** Seed the whole draft from a schema and enter edit mode. The single
   *  source of truth for "what does opening the editor populate" — every
   *  entry path (Edit, re-scrape, regen image, upload) funnels through here,
   *  so a new field can never be forgotten on one path. */
  begin: (schema: SchemaRecipe, row: EditRowFields) => void;
  /** Leave edit mode (does not touch the canonical schema). */
  cancel: () => void;
  /** Merge the current draft onto a base schema to produce the schema to
   *  persist. `name` is required on SchemaRecipe, so a blank title falls back
   *  to the base name rather than wiping it. */
  buildSchema: (base: SchemaRecipe) => SchemaRecipe;
  /** Run an async persist, owning the saving → idle/error transition. A throw
   *  leaves the editor in "error" with the draft intact so the user can retry. */
  runSave: (persist: () => Promise<void>) => Promise<void>;
}

/**
 * One recipe time's contribution to the saved schema. `parseMinutesInput`'s
 * three-way result maps straight onto the patch semantics `updateRecipeRow`
 * expects: a number sets the time, `null` clears it, and an unparseable entry
 * falls back to the stored value — a bad time degrades to "no change" rather
 * than blocking the save, exactly as an invalid servings input does.
 */
function buildTime(
  raw: string,
  base: string | null | undefined,
): string | null | undefined {
  const minutes = parseMinutesInput(raw);
  if (minutes === undefined) return base;
  if (minutes === null) return null;
  return minutesToIso(minutes) ?? null;
}

/** A timer needs a label; a label on its own is fine. So the only invalid
 *  state is a time entered with no label. */
function findInstructionErrors(
  instructions: EditableInstructions,
): Set<string> {
  const errors = new Set<string>();
  for (const group of instructions) {
    for (const step of group.items) {
      const hasName = step.name.trim().length > 0;
      const hasTime = (step.minutes || 0) > 0 || (step.seconds || 0) > 0;
      if (hasTime && !hasName) errors.add(step.id);
    }
  }
  return errors;
}

/**
 * Owns the recipe edit buffer for RecipeDetail: the draft form fields plus the
 * idle → editing → saving → idle/error state machine. State lives in a single
 * `useState<EditDraft>` (patched shallowly) rather than separate fields,
 * which is what previously let an entry path silently miss a field.
 */
export function useRecipeEditor(): UseRecipeEditor {
  const [draft, setDraft] = useState<EditDraft>(EMPTY_DRAFT);
  const [editState, setEditState] = useState<EditState>("idle");

  const patch = useCallback(
    (partial: Partial<EditDraft>) => setDraft((d) => ({ ...d, ...partial })),
    [],
  );

  const begin = useCallback(
    (schema: SchemaRecipe, { status, url, source }: EditRowFields) => {
      setDraft({
        name: schema.name,
        url,
        description: schema.description ?? "",
        ingredients: schemaToEditableIngredients(schema.recipeIngredient ?? []),
        instructions: schemaToEditableInstructions(
          schema.recipeInstructions ?? [],
        ),
        notes: schema.notes ?? "",
        status,
        source,
        servings: parseServings(schema.recipeYield)?.toString() ?? "",
        prepTime: isoToMinutes(schema.prepTime)?.toString() ?? "",
        cookTime: isoToMinutes(schema.cookTime)?.toString() ?? "",
        totalTime: isoToMinutes(schema.totalTime)?.toString() ?? "",
      });
      setEditState("editing");
    },
    [],
  );

  const cancel = useCallback(() => setEditState("idle"), []);

  const buildSchema = useCallback(
    (base: SchemaRecipe): SchemaRecipe => {
      // Only rewrite the yield when the parsed input is a valid count that
      // differs from the base. The changed-check is load-bearing: a range
      // like "6-8 servings" seeds the input with its midpoint ("7"), so an
      // untouched save would otherwise silently collapse the range.
      const n = Number(draft.servings.trim());
      const servingsChanged =
        Number.isInteger(n) && n >= 1 && n !== parseServings(base.recipeYield);
      return {
        ...base,
        name: draft.name.trim() || base.name,
        description: draft.description || undefined,
        recipeIngredient: editableIngredientsToSchema(draft.ingredients),
        recipeInstructions: editableInstructionsToSchema(draft.instructions),
        notes: draft.notes || undefined,
        recipeYield: servingsChanged
          ? applyServings(base.recipeYield, n)
          : base.recipeYield,
        prepTime: buildTime(draft.prepTime, base.prepTime),
        cookTime: buildTime(draft.cookTime, base.cookTime),
        totalTime: buildTime(draft.totalTime, base.totalTime),
      };
    },
    [draft],
  );

  const runSave = useCallback(async (persist: () => Promise<void>) => {
    setEditState("saving");
    try {
      await persist();
      setEditState("idle");
    } catch {
      setEditState("error");
    }
  }, []);

  const instructionErrors = useMemo(
    () => findInstructionErrors(draft.instructions),
    [draft.instructions],
  );

  return {
    draft,
    editState,
    isEditing: editState !== "idle",
    isSaving: editState === "saving",
    instructionErrors,
    canSave: instructionErrors.size === 0,
    patch,
    begin,
    cancel,
    buildSchema,
    runSave,
  };
}
