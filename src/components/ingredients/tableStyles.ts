// Frozen columns + sticky header for the ingredient catalog table. The table
// lives in a single max-h-screen scroll box (IngredientsTable) that scrolls
// both axes, so:
//   - the header cells stick to the top (column labels stay visible while the
//     body scrolls vertically),
//   - Name + Aliases stick to the left and Actions sticks to the right (the
//     columns you read/edit/act on stay in view while nutrition scrolls).
// Header and body cells share these strings so the two can never disagree on
// width or offset — the Aliases `left` offset MUST equal the Name column width
// (w-44 → left-44). `bg-background` keeps every frozen/sticky cell opaque so the
// scrolling cells don't bleed through; body cells append `group-hover:bg-muted/50`
// (with `group` on the row) so a frozen cell tracks the row's hover shade
// instead of showing a seam. z-order: the sticky header (z-20) and its
// frozen-column corners (z-30) sit above the frozen body columns (z-10), which
// sit above the scrolling cells.
// max-w matters: in an auto-layout table, unshrinkable cell content (long
// text without an effective truncate) widens the column past w-44, which
// silently breaks the second frozen column's left-44 offset. Cell content
// must also be shrinkable (min-w-0 on flex children) for truncate to bite.
const NAME_COL = "w-44 min-w-44 max-w-44";

/** Header cells that only stick to the top (the scrolling middle columns). */
export const STICKY_HEAD = "sticky top-0 z-20 bg-background";

/** Frozen body columns. */
export const STICKY_NAME_CELL = `sticky left-0 z-10 ${NAME_COL} bg-background`;
export const STICKY_ALIASES_CELL = `sticky left-44 z-10 ${NAME_COL} border-r border-border bg-background`;
export const STICKY_ACTIONS_CELL =
  "sticky right-0 z-10 border-l border-border bg-background";

/** Frozen header corners (top + left/right — above both the header and columns). */
export const STICKY_NAME_HEAD = `sticky left-0 top-0 z-30 ${NAME_COL} bg-background`;
export const STICKY_ALIASES_HEAD = `sticky left-44 top-0 z-30 ${NAME_COL} border-r border-border bg-background`;
export const STICKY_ACTIONS_HEAD =
  "sticky right-0 top-0 z-30 border-l border-border bg-background";
