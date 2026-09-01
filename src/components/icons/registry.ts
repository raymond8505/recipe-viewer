import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import * as Icons from "./index";

/**
 * Every icon in the set, with the lucide glyph behind it and where it is used.
 *
 * Deliberately **not** re-exported from `index.ts`: the Storybook table and
 * `icons.test.tsx` both check this list against `Object.keys(Icons)`, and a
 * registry that lived in the barrel would show up in its own comparison.
 *
 * The `usedIn` column is the reason this file exists rather than the story
 * deriving everything — it is the one fact that can't be read off the module.
 */
export interface IconEntry {
  /** Export name in `@/components/icons`. */
  name: keyof typeof Icons;
  component: ComponentType<LucideProps>;
  /** The `lucide-react` export it wraps. */
  lucide: string;
  /** Default rendered size in px, before a caller's `size` or `w-*`/`size-*` class. */
  size: number;
  /** Components that render it, stories excluded. */
  usedIn: string[];
}

export const iconRegistry: IconEntry[] = [
  {
    name: "CheckIcon",
    component: Icons.CheckIcon,
    lucide: "Check",
    size: 18,
    usedIn: ["CookingMode", "CopyShoppingListButton"],
  },
  {
    name: "ChefHatIcon",
    component: Icons.ChefHatIcon,
    lucide: "ChefHat",
    size: 14,
    usedIn: ["CookButton"],
  },
  {
    name: "ClockIcon",
    component: Icons.ClockIcon,
    lucide: "Clock",
    size: 14,
    usedIn: ["RecipeCard"],
  },
  {
    name: "CloseIcon",
    component: Icons.CloseIcon,
    lucide: "X",
    size: 18,
    usedIn: ["CloseButton"],
  },
  {
    name: "CloseSmallIcon",
    component: Icons.CloseSmallIcon,
    lucide: "X",
    size: 12,
    usedIn: ["MealTabs"],
  },
  {
    name: "CopyIcon",
    component: Icons.CopyIcon,
    lucide: "Copy",
    size: 18,
    usedIn: ["CopyShoppingListButton"],
  },
  {
    name: "DragHandleIcon",
    component: Icons.DragHandleIcon,
    lucide: "GripVertical",
    size: 16,
    usedIn: ["DragHandleButton"],
  },
  {
    name: "EditIcon",
    component: Icons.EditIcon,
    lucide: "SquarePen",
    size: 18,
    usedIn: ["TimerCard", "NutritionDetailRow"],
  },
  {
    name: "EnterFullscreenIcon",
    component: Icons.EnterFullscreenIcon,
    lucide: "Maximize",
    size: 18,
    usedIn: ["CookingMode"],
  },
  {
    name: "ExitFullscreenIcon",
    component: Icons.ExitFullscreenIcon,
    lucide: "Minimize",
    size: 18,
    usedIn: ["CookingMode"],
  },
  {
    name: "ExternalLinkIcon",
    component: Icons.ExternalLinkIcon,
    lucide: "ExternalLink",
    size: 18,
    usedIn: ["RecipeControls"],
  },
  {
    name: "ImageIcon",
    component: Icons.ImageIcon,
    lucide: "Image",
    size: 48,
    usedIn: ["ImagePlaceholder"],
  },
  {
    name: "PauseIcon",
    component: Icons.PauseIcon,
    lucide: "Pause",
    size: 14,
    usedIn: ["TimerCard"],
  },
  {
    name: "PlayIcon",
    component: Icons.PlayIcon,
    lucide: "Play",
    size: 14,
    usedIn: ["TimerCard"],
  },
  {
    name: "PlusIcon",
    component: Icons.PlusIcon,
    lucide: "Plus",
    size: 18,
    usedIn: ["AddTimerButton"],
  },
  {
    name: "ResetIcon",
    component: Icons.ResetIcon,
    lucide: "RotateCcw",
    size: 16,
    usedIn: ["TimerCard"],
  },
  {
    name: "SearchIcon",
    component: Icons.SearchIcon,
    lucide: "Search",
    size: 16,
    usedIn: ["SearchBar", "MealSearch"],
  },
  {
    name: "SmallPlusIcon",
    component: Icons.SmallPlusIcon,
    lucide: "Plus",
    size: 14,
    usedIn: ["AddRowButton", "AddTimerButton"],
  },
  {
    name: "SpinnerIcon",
    component: Icons.SpinnerIcon,
    lucide: "LoaderCircle",
    size: 16,
    usedIn: [
      "MealSearch",
      "IngredientAutocomplete",
      "IngredientsTable",
      "NutritionDetailRow",
    ],
  },
  {
    name: "TrashIcon",
    component: Icons.TrashIcon,
    lucide: "Trash",
    size: 16,
    usedIn: ["TimerCard", "SortableItem", "GroupContainer", "InstructionsEditor"],
  },
  {
    name: "WarningIcon",
    component: Icons.WarningIcon,
    lucide: "TriangleAlert",
    size: 16,
    usedIn: ["NutritionDetail", "NutritionDetailRow"],
  },
];
