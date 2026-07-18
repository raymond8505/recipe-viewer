// Frozen (sticky-left) Name + Aliases columns so only the nutrition columns
// scroll horizontally. The header cells (IngredientsTable) and the body cells
// (IngredientRowEditor) share these class strings so the two can never disagree
// on width or offset — the Aliases `left` offset MUST equal the Name column
// width (w-44 → left-44). `bg-background` keeps the frozen cells opaque so the
// scrolling nutrition cells don't bleed through; body cells additionally append
// `group-hover:bg-muted/50` (with `group` on the row) so the frozen cells track
// the row's hover shade instead of showing a seam.
export const STICKY_NAME_CELL = "sticky left-0 z-10 w-44 min-w-44 bg-background";
export const STICKY_ALIASES_CELL =
  "sticky left-44 z-10 w-44 min-w-44 border-r border-border bg-background";
