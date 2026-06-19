import { useCallback, useMemo, useState } from "react";
import type { SchemaRecipe } from "@/types/recipe";
import type { EditableIngredients, EditableInstructions } from "@/types/editor";
import {
  editableIngredientsToSchema,
  editableInstructionsToSchema,
  schemaToEditableIngredients,
  schemaToEditableInstructions,
} from "@/lib/format";

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
}

const EMPTY_DRAFT: EditDraft = {
  name: "",
  url: "",
  description: "",
  ingredients: [],
  instructions: [],
  notes: "",
  status: "",
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
  begin: (schema: SchemaRecipe, status: string, url: string) => void;
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

/** A step's name and timer must be both-set or both-blank. */
function findInstructionErrors(
  instructions: EditableInstructions,
): Set<string> {
  const errors = new Set<string>();
  for (const group of instructions) {
    for (const step of group.items) {
      const hasName = step.name.trim().length > 0;
      const hasTime = (step.minutes || 0) > 0 || (step.seconds || 0) > 0;
      if (hasName !== hasTime) errors.add(step.id);
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
    (schema: SchemaRecipe, status: string, url: string) => {
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
      });
      setEditState("editing");
    },
    [],
  );

  const cancel = useCallback(() => setEditState("idle"), []);

  const buildSchema = useCallback(
    (base: SchemaRecipe): SchemaRecipe => ({
      ...base,
      name: draft.name.trim() || base.name,
      description: draft.description || undefined,
      recipeIngredient: editableIngredientsToSchema(draft.ingredients),
      recipeInstructions: editableInstructionsToSchema(draft.instructions),
      notes: draft.notes || undefined,
    }),
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
