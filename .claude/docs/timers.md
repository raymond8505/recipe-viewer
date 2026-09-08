# Cooking-Mode Timers

## TimerCard Layout

`src/components/cooking/TimerCard.tsx` uses a **three-column layout** for running/paused/finished states:
- **Left col (`w-12`, fixed):** play/pause icon (top) + reset (bottom). The icon button has `aria-label` of just the action ("Pause", "Resume", or "Restart") — shorter than the middle-col label ("Pause {name}" etc.) to avoid duplicate-label test failures. The **SVG icons inside** (`PauseIcon`, `PlayIcon`) carry `aria-hidden="true"`. Do NOT put `aria-hidden` on the button itself — the button must be in the tab order.
- **Middle col (`flex-1`):** name + time, rendered as a `<button>` that calls `onTogglePause` (running/paused) or `onReset` (finished). This is the primary accessible tap target and carries the full aria-label.
- **Right col (`w-12`, fixed):** edit (top) + delete (bottom).

**The middle-col `TAP_BLOCK` must stay `items-stretch`.** The `Button` primitive is `inline-flex`, so the label/time spans are flex items; only stretched do they fill the column, which is what lets the label `truncate`. Left alignment comes from `text-left`.

**Alarm state is intentionally 2-column** (dismiss left, reset+delete right) — there is no play/pause concept. Do not normalize it to 3-column.

**TimerCard tests (`src/__tests__/TimerCard.test.tsx`) use aria-label regexes.** Before renaming any button label, grep the test file for the old string — broken labels cause hard `getByLabelText` failures, not soft mismatches.

**Duplicate aria-label = hard `getByLabelText` failure.** If two buttons share the same aria-label, Testing Library throws rather than returning the first match. Guard against this when adding redundant visual affordances alongside accessible tap targets.

## Timer Container — Two Views

The phrase "timer container" refers to the timer UI in **both** orientations:
- **Portrait / mobile (`lg:hidden`):** horizontal `DraggableRibbon` strip at the top of the screen
- **Landscape / desktop (`lg:flex`):** vertical `TimerColumn` on the right side

Both views render the same timer data. When making changes to timer display, interaction, or scroll behaviour, both views must be updated. Both render `<div data-timer-id={timer.id}>` wrappers around each `TimerCard` so features can target timers by ID in either view with `querySelectorAll` (not `querySelector` — both elements exist in the DOM simultaneously, only one is visible via CSS).

**Ribbon children go through `RibbonItem`** (exported from `DraggableRibbon.tsx`), which is bounded (`min-w-56 max-w-72`), never a fixed `w-*`. The 3-column `TimerCard` needs ~212–245px on a phone for `text-3xl` mono times like "1:30:00", so it must size to its content; the cap is what makes a long label `truncate` rather than push the card past the viewport, which `snap-mandatory` can't scroll to.
