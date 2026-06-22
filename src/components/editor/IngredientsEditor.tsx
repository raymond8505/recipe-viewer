"use client";

import { nanoid } from "nanoid";
import type { EditableIngredient, EditableIngredients } from "@/types/editor";
import SortableGroupedList from "./SortableGroupedList";

interface IngredientsEditorProps {
  value: EditableIngredients;
  onChange: (groups: EditableIngredients) => void;
  disabled?: boolean;
}

/**
 * Structured ingredient editor: each ingredient is a draggable text input;
 * groups (the schema's `group` string) are reorderable and carry their items.
 * The grouping is UI-only — `useRecipeEditor` converts to/from the flat stored
 * shape via `editableIngredientsToSchema` / `schemaToEditableIngredients`.
 */
export default function IngredientsEditor({
  value,
  onChange,
  disabled,
}: IngredientsEditorProps) {
  return (
    <SortableGroupedList<EditableIngredient>
      groups={value}
      onChange={onChange}
      disabled={disabled}
      makeItem={() => ({ id: nanoid(), name: "" })}
      itemLabel={(item) => item.name}
      itemNoun="ingredient"
      groupNoun="group"
      renderItem={(item, update) => (
        <input
          type="text"
          value={item.name}
          onChange={(e) => update({ name: e.target.value })}
          disabled={disabled}
          placeholder="e.g. 1 tsp cumin"
          aria-label="Ingredient"
          className="w-full min-h-[40px] rounded-lg border border-gray-200 px-2 text-sm text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-orange-300 disabled:opacity-60"
        />
      )}
    />
  );
}
