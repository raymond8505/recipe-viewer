"use client";

import { nanoid } from "nanoid";
import type { EditableIngredient, EditableIngredients } from "@/types/editor";
import { Input } from "@/components/ui/input";
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
        <Input
          type="text"
          value={item.name}
          onChange={(e) => update({ name: e.target.value })}
          disabled={disabled}
          placeholder="e.g. 1 tsp cumin"
          aria-label="Ingredient"
          className="min-h-[40px]"
        />
      )}
    />
  );
}
