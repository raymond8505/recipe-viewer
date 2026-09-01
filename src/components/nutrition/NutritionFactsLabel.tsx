import { formatNutrientDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LabelData, LabelRow } from "./labelRows";

// A Nutrition Facts panel, purely presentational: the rows arrive already
// scaled to the serving that `servingLabel` names — no math in here.
//
// The STRUCTURE is the FDA's (serving basis, Calories, grouped nutrient rows,
// minerals along the foot) because that's the arrangement people already know
// how to read — minus the "Nutrition Facts" title, since both callers render a
// heading directly above the label. The STYLING is the site's: warm
// `border-border` rules instead of the regulation's heavy black bars,
// serif-light display type instead of the condensed black sans, and one
// `border-brand` accent on the rule above Calories to carry the focal point.
// Three border tiers do the work the FDA's 1/4/8px bars used to:
//   border-brand (2px)  — the Calories rule, the one accent in the label
//   border-border (2px) — section rules (nutrient list, minerals)
//   border-border (1px) — row hairlines and the tabular column dividers
// Don't reintroduce `font-black` or `border-foreground`; hierarchy here comes
// from size and spacing, per the site's typography rules.
//
// TWO LAYOUTS, ONE MARKUP. `layout="tabular"` is the FDA's tabular display —
// title block, then the nutrient groups as side-by-side columns — but only when
// there's room; it falls back to the vertical panel when there isn't, which is
// what the FDA itself prescribes when horizontal space runs out. The fallback
// needs no second DOM because document order IS the vertical label: title →
// Calories → fats → carbs → minerals. The @lg: classes only re-arrange those
// same children into columns, so no text is duplicated and tests see one copy.
//
// The breakpoint is a CONTAINER query, not a viewport one. This label renders
// in a wide recipe page and in a ~360px cooking-mode column at the same viewport
// width, so `lg:` would pick the wrong layout for one of them. The wrapper
// carries `@container`; the variants are `@lg` (32rem of container width).
//
// Absent nutrients render an em dash, not 0 — key sparsity is meaningful
// (absent ≠ zero), and it keeps a half-typed draft value from flashing as a
// fake zero while the user edits.

/** Eyebrow labels, in the site's uppercase-tracked sans (not the FDA's bold). */
const EYEBROW =
  "font-sans text-[10px] font-semibold uppercase tracking-widest text-muted-foreground";

function NutrientRow({ row, tabular }: { row: LabelRow; tabular: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-border py-1 text-sm">
      <span className={cn(!row.sub && "font-semibold", row.sub && "pl-4")}>
        {/* Tabular columns are narrow, so they take the FDA's own
            abbreviations; stacked, there's room for the full wording. Only one
            is ever visible, and only when the two differ. */}
        {tabular && row.short && row.short !== row.name ? (
          <>
            <span className="@lg:hidden">{row.name}</span>
            <span className="hidden @lg:inline">{row.short}</span>
          </>
        ) : (
          row.name
        )}
      </span>
      <span className="tabular-nums">
        {row.value ? formatNutrientDisplay(row.value) : "—"}
      </span>
    </div>
  );
}

/** The tabular columns' shared heading. Hidden while the label is stacked,
 *  where the rows sit directly under the panel's own section rule instead. */
function ColumnHeading() {
  return (
    <div className={cn("hidden @lg:block border-b border-border pb-1", EYEBROW)}>
      Amount/serving
    </div>
  );
}

export default function NutritionFactsLabel({
  data,
  servingLabel,
  servingCaption,
  layout = "vertical",
  className,
}: {
  /** Rows already scaled to the serving being shown — see labelRows.ts. */
  data: LabelData;
  /** The serving the amounts describe, e.g. "tbsp, whole (6 g)" or "100 g". */
  servingLabel: string;
  /**
   * Left-hand caption for the serving line, as the real label's "Serving size".
   * Omit when `servingLabel` is already a phrase that reads on its own
   * ("per 114 g serving"), which would otherwise become "Serving size: per
   * 114 g serving".
   */
  servingCaption?: string;
  /**
   * "vertical" is always the classic stacked panel. "tabular" is the FDA
   * tabular display once the container reaches 32rem, and the vertical panel
   * below that.
   */
  layout?: "vertical" | "tabular";
  className?: string;
}) {
  const tabular = layout === "tabular";
  const { calories, fats, carbs, micros } = data;

  return (
    <div
      className={cn(
        "rounded-sm border border-border bg-card p-4 text-card-foreground",
        tabular && "@container",
        className,
      )}
    >
      <div
        className={cn(
          tabular && "@lg:grid @lg:grid-cols-[auto_1fr_1fr] @lg:gap-x-5",
        )}
      >
        {/* Block 1 — serving basis and Calories. The leftmost block in tabular;
            the head of the panel when stacked. There is deliberately no
            "Nutrition Facts" title: both callers already render a heading
            immediately above the label (the panel's "Nutrition", the catalog
            drawer's "Label preview"), so it only ever read as a duplicate. */}
        <div>
          <div className="flex items-baseline justify-between gap-2 text-sm font-semibold">
            {servingCaption && (
              <span className="text-muted-foreground">{servingCaption}</span>
            )}
            <span className={cn(servingCaption && "text-right")}>
              {servingLabel}
            </span>
          </div>
          {/* The label's one accent: brand on the rule that introduces the
              number people actually look for. */}
          <div className="mt-2 border-t-2 border-brand pt-2">
            <div className={EYEBROW}>Amount per serving</div>
            <div className="mt-0.5 flex items-baseline justify-between gap-3">
              <span className="text-lg font-semibold">Calories</span>
              <span className="font-heading text-4xl font-light leading-none tabular-nums">
                {calories != null
                  ? formatNutrientDisplay({ value: calories.value, unit: "" })
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Block 2 — fats, cholesterol, sodium. The section rule that opens the
            nutrient list becomes this column's left divider in tabular. */}
        <div
          className={cn(
            "mt-3 border-t-2 border-border pt-1",
            tabular &&
              "@lg:mt-0 @lg:border-t-0 @lg:border-l @lg:border-border @lg:pt-0 @lg:pl-5",
          )}
        >
          {tabular && <ColumnHeading />}
          {/* Nested so :first-child means the first ROW, not the heading. */}
          <div className="[&>*:first-child]:border-t-0">
            {fats.map((row) => (
              <NutrientRow key={row.key} row={row} tabular={tabular} />
            ))}
          </div>
        </div>

        {/* Block 3 — carbohydrates and protein. Stacked, it continues block 2's
            list unbroken, so every row keeps its hairline; as a column it drops
            the first one, since the heading rule already sits above it. */}
        <div
          className={cn(
            tabular && "@lg:border-l @lg:border-border @lg:pl-5",
          )}
        >
          {tabular && <ColumnHeading />}
          <div className={cn(tabular && "@lg:[&>*:first-child]:border-t-0")}>
            {carbs.map((row) => (
              <NutrientRow key={row.key} row={row} tabular={tabular} />
            ))}
          </div>
        </div>
      </div>

      {/* Minerals, below the closing section rule: full-width rows when stacked,
          a single inline run across the foot in tabular — where the real label
          puts them. */}
      <div className="mt-3 border-t-2 border-border">
        <div
          className={cn(
            "[&>*:first-child]:border-t-0",
            tabular &&
              "@lg:flex @lg:flex-wrap @lg:gap-x-8 @lg:[&>*]:border-t-0 @lg:[&>*]:justify-start @lg:[&>*]:gap-2",
          )}
        >
          {micros.map((row) => (
            <NutrientRow key={row.key} row={row} tabular={tabular} />
          ))}
        </div>
      </div>
    </div>
  );
}
