# Manual QA — Structured Recipe Editor (`edit-ui`)

> Not committed — scratch doc for manual verification. Delete when done.

## Test recipe

A draft duplicate was created for QA:

- **Name:** High Protein Burrito Bowl (QA Copy)
- **ID:** `218efc94-3aee-4765-934e-24a8996a7860`
- **Local:** http://localhost:3000/recipes/218efc94-3aee-4765-934e-24a8996a7860
- **Staging (once PR is open):** https://edit-ui.new.raymonds.recipes/recipes/218efc94-3aee-4765-934e-24a8996a7860
- **Source of truth:** duplicated from `e0a8a7b7-4ecc-42a4-8606-d8328adcf1d1`

What it exercises: **25 ingredients, all grouped** (multiple sections) and **5 flat instruction steps** (no `HowToSection` — you'll add one in step I-3 to cover that path). Status is **draft**, so you must be **logged in** to view it.

Run `yarn dev`, log in, open the recipe, click **Edit**.

---

## A. Ingredients editor

- [ ] **Desktop width** — on a wide (`lg`) screen the whole recipe column is noticeably wider (~1024px); on mobile/tablet it's unchanged.
- [ ] **Width** — an ingredient input shows roughly a full line of text (~2× the old ~15 chars). Drag handle is a thin grip, delete is a small trash.
- [ ] **Group header chrome** — a section's name input uses the same compact handle/delete as the rows (not oversized), giving the heading plenty of room.
- [ ] **Edit** — type into an ingredient; text stays as you typed.
- [ ] **Reorder within a group** — drag an ingredient by its handle above/below a sibling; order updates and holds.
- [ ] **Move between groups** — drag an ingredient from one section into another, and into the ungrouped section if present; it lands where dropped.
- [ ] **Reorder a group** — drag a section by its header handle; the whole section moves with all its ingredients.
- [ ] **Add to a group** — a section's own "Add ingredient" appends a blank row to *that* section.
- [ ] **Add to the list** — top-level "Add ingredient" appends to the ungrouped section (creating it if needed).
- [ ] **Add a group** — "Add group" adds an empty named section with a heading input.
- [ ] **Delete + confirm (row)** — trash a row → **Cancel** restores it; trash again → **Delete** removes it.
- [ ] **Delete + confirm (group)** — trash a section header → confirm reads *"…and its N ingredients?"* with the correct count → **Delete** removes the section and its items.
- [ ] **Keyboard a11y** — Tab to a drag handle, **Space** to lift, **Arrow** to move, **Space** to drop.

## B. Instructions editor

- [ ] **Step card** — each step has an auto-sizing body textarea (opens tall enough to show all its text, grows as you type) and a bottom row with **Timer label**, a **duration** field, and the **delete** button — all inline horizontally.
- [ ] **Duration field is `m:ss`** — it's a plain text input (no AM/PM time-of-day picker). Type `5:30` → 5 min 30 s; type a bare `5` → blurs to `5:00`; `0:45` → 45 s. **No AM/PM anywhere.**
- [ ] **Co-dependency: label only** — set a label, leave the duration blank → field outlines red, inline message shows, and **Save is disabled** ("A step timer needs both a label and a time").
- [ ] **Co-dependency: resolve** — enter a duration (e.g. `0:30`) → error clears, **Save re-enables**.
- [ ] **Co-dependency: time only** — clear the label but keep the duration → blocked again the same way.
- [ ] **Inline delete** — the trash sits in the bottom row next to the duration (not in a right rail); clicking it → **Cancel** restores the step, trash again → **Delete** removes it.
- [ ] **I-3 Add a section** — "Add section" adds a named instruction group; drag a step into it; reorder steps within and between groups; reorder the section.
- [ ] **Add / delete steps** — add a step to the list and to a section.

## C. Save / round-trip

- [ ] Set a valid timer on one step (label + duration, e.g. **5:30**), keep the section you added, then **Save**.
- [ ] **Reload** the page — ingredient groups intact, the new instruction section intact, the step's timer persisted (reopen Edit → duration still reads **5:30**).
- [ ] **Cook mode** — the step with label + time seeds a timer (e.g. "Simmer 5:30").
- [ ] **View mode** renders ingredients/instructions normally.
- [ ] **JSON-LD** — view page source; the `application/ld+json` block has clean Schema.org (ingredients are plain strings, no `group` objects, no `notes`/app-only fields).

## D. Edge cases

- [ ] **Blank rows dropped** — leave an ingredient and a step blank, Save, reload → blanks are gone, no errors.
- [ ] **Empty section dropped** — add a section with no steps, Save, reload → it's not persisted.
- [ ] **Cancel** — make changes, hit **Cancel** → nothing persists; view reflects the last saved state.

## E. Legacy data cleanup (already applied to prod)

- [ ] Open a recipe that previously had a **named step with no timer** → editing it no longer trips the co-dependency validator (stray `name` was stripped).
- [ ] A recipe with a **real timer** still shows label + time (editor and cook mode).
- [ ] A recipe with **instruction sections** still shows its section headings (cleanup never touched `HowToSection.name`).
- [ ] When satisfied, drop the backup: `drop table recipes_instr_backup_20260619;` (Supabase project `xonkmdhnjpjkapnsmltu`).

## Cleanup after QA

- [ ] Delete the QA draft recipe `218efc94-3aee-4765-934e-24a8996a7860` (or keep it as a fixture).
- [ ] Delete this file.
