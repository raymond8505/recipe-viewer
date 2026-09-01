import { formatNutrientDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LabelData, LabelRow } from "./labelRows";

// An FDA-style Nutrition Facts panel, purely presentational: the rows arrive
// already scaled to the serving that `servingLabel` names — no math in here.
// The point of the classic look (heavy rules, big black Calories) is to let the
// user hold a real package label next to it and compare line by line.
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
//
// The header is a <div>, not an h-tag: the global base layer styles headings
// serif-light, and this must stay sans black like the real label.

function NutrientRow({ row, tabular }: { row: LabelRow; tabular: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-foreground/40 py-0.5 text-sm">
      <span className={cn(!row.sub && "font-bold", row.sub && "pl-4")}>
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
 *  where the rows sit directly under the panel's own heavy rule instead. */
function ColumnHeading() {
  return (
    <div className="hidden @lg:block border-b border-foreground/40 pb-0.5 text-[10px] font-bold uppercase tracking-wide">
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
        "border border-foreground bg-card p-3 font-sans text-card-foreground",
        tabular && "@container",
        className,
      )}
    >
      <div
        className={cn(
          tabular && "@lg:grid @lg:grid-cols-[auto_1fr_1fr] @lg:gap-x-3",
        )}
      >
        {/* Block 1 — identity and Calories. The leftmost block in tabular; the
            head of the panel when stacked. */}
        <div>
          <div className="text-2xl font-black leading-none tracking-tight">
            Nutrition Facts
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-foreground/40 pt-1 text-sm font-bold">
            {servingCaption && <span>{servingCaption}</span>}
            <span className={cn(servingCaption && "text-right")}>
              {servingLabel}
            </span>
          </div>
          <div className="mt-1 border-t-8 border-foreground pt-1">
            <div className="text-[10px] font-bold uppercase tracking-wide">
              Amount per serving
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="text-xl font-black">Calories</span>
              <span className="text-3xl font-black leading-none tabular-nums">
                {calories != null
                  ? formatNutrientDisplay({ value: calories.value, unit: "" })
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Block 2 — fats, cholesterol, sodium. The heavy rule that opens the
            nutrient list becomes this column's left divider in tabular. */}
        <div
          className={cn(
            "mt-1 border-t-4 border-foreground pt-1",
            tabular &&
              "@lg:mt-0 @lg:border-t-0 @lg:border-l @lg:border-foreground/40 @lg:pt-0 @lg:pl-3",
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
            tabular &&
              "@lg:border-l @lg:border-foreground/40 @lg:pl-3",
          )}
        >
          {tabular && <ColumnHeading />}
          <div
            className={cn(tabular && "@lg:[&>*:first-child]:border-t-0")}
          >
            {carbs.map((row) => (
              <NutrientRow key={row.key} row={row} tabular={tabular} />
            ))}
          </div>
        </div>
      </div>

      {/* Minerals, below the closing heavy rule: full-width rows when stacked,
          a single inline run across the foot in tabular — where the real label
          puts them. */}
      <div className="mt-1 border-t-8 border-foreground">
        <div
          className={cn(
            "[&>*:first-child]:border-t-0",
            tabular &&
              "@lg:flex @lg:flex-wrap @lg:gap-x-6 @lg:[&>*]:border-t-0 @lg:[&>*]:justify-start @lg:[&>*]:gap-1",
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
