import { useCallback, useState } from "react";
import type { SchemaRecipe } from "@/types/recipe";
import {
  ingredientsToText,
  instructionsToMarkdown,
  markdownToInstructions,
  textToIngredients,
} from "@/lib/format";

export type EditState = "idle" | "editing" | "saving" | "error";

/** The editable form fields, as plain strings (textarea/input values). */
export interface EditDraft {
  name: string;
  url: string;
  description: string;
  ingredients: string;
  instructions: string;
  notes: string;
  status: string;
}

const EMPTY_DRAFT: EditDraft = {
  name: "",
  url: "",
  description: "",
  ingredients: "",
  instructions: "",
  notes: "",
  status: "",
};

export interface UseRecipeEditor {
  draft: EditDraft;
  editState: EditState;
  isEditing: boolean;
  isSaving: boolean;
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

/**
 * Owns the recipe edit buffer for RecipeDetail: the draft form fields plus the
 * idle → editing → saving → idle/error state machine. State lives in a single
 * `useState<EditDraft>` (patched shallowly) rather than seven separate fields,
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
        ingredients: ingredientsToText(schema.recipeIngredient ?? []),
        instructions: instructionsToMarkdown(schema.recipeInstructions ?? []),
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
      recipeIngredient: textToIngredients(draft.ingredients),
      recipeInstructions: markdownToInstructions(draft.instructions),
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

  return {
    draft,
    editState,
    isEditing: editState !== "idle",
    isSaving: editState === "saving",
    patch,
    begin,
    cancel,
    buildSchema,
    runSave,
  };
}
