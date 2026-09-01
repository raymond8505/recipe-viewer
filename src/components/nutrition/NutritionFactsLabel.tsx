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
// ONLY TRACKED NUTRIENTS ARE SHOWN. A nutrient the source doesn't carry is
// omitted, not rendered as an em dash: a real package label lists what was
// measured, and a column of dashes reads as broken rather than as "unknown".
// Sections and tabular columns that empty out collapse with their rules, so a
// sparse recipe degrades to a short label instead of a skeleton — which is why
// the grid template below is chosen from the number of surviving blocks.
//
// TWO LAYOUTS, ONE MARKUP. `layout="tabular"` is the FDA's tabular display —
// title block, then the nutrient groups as side-by-side columns — but only when
// there's room; it falls back to the vertical panel when there isn't, which is
// what the FDA itself prescribes when horizontal space runs out. The fallback
// needs no second DOM because document order IS the vertical label: serving →
// Calories → fats → carbs → minerals. The @lg: classes only re-arrange those
// same children into columns, so no text is duplicated and tests see one copy.
//
// The breakpoint is a CONTAINER query, not a viewport one. This label renders
// in a wide recipe page and in a ~360px cooking-mode column at the same viewport
// width, so `lg:` would pick the wrong layout for one of them. The wrapper
// carries `@container`; the variants are `@lg` (32rem of container width).

/** Eyebrow labels, in the site's uppercase-tracked sans (not the FDA's bold). */
const EYEBROW =
  "font-sans text-[10px] font-semibold uppercase tracking-widest text-muted-foreground";

/** Grid template per number of rendered blocks; the serving/Calories block
 *  always counts, so this only varies with how many nutrient groups survive. */
const GRID_COLUMNS: Record<number, string> = {
  2: "@lg:grid @lg:grid-cols-[auto_1fr] @lg:gap-x-5",
  3: "@lg:grid @lg:grid-cols-[auto_1fr_1fr] @lg:gap-x-5",
};

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
      <span className="tabular-nums">{formatNutrientDisplay(row.value!)}</span>
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
  const { calories } = data;

  // Untracked nutrients are dropped, not dashed. A group that loses every row
  // stops being rendered at all, so its rule and (in tabular) its column go too.
  const tracked = (rows: LabelRow[]) => rows.filter((row) => row.value != null);
  const groups = [tracked(data.fats), tracked(data.carbs)].filter(
    (rows) => rows.length > 0,
  );
  const micros = tracked(data.micros);

  return (
    <div
      className={cn(
        "rounded-sm border border-border bg-card p-4 text-card-foreground",
        tabular && "@container",
        className,
      )}
    >
      <div className={cn(tabular && GRID_COLUMNS[groups.length + 1])}>
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
              number people actually look for. Goes with it when it's absent. */}
          {calories != null && (
            <div className="mt-2 border-t-2 border-brand pt-2">
              <div className={EYEBROW}>Amount per serving</div>
              <div className="mt-0.5 flex items-baseline justify-between gap-3">
                <span className="text-lg font-semibold">Calories</span>
                <span className="font-heading text-4xl font-light leading-none tabular-nums">
                  {formatNutrientDisplay({ value: calories.value, unit: "" })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* The nutrient groups. Stacked they read as one continuous list, so
            only the first carries the section rule and only the first suppresses
            its leading hairline; as columns each gets a left divider, and the
            second suppresses its hairline too since a heading rule sits above. */}
        {groups.map((rows, i) => (
          <div
            key={rows[0].key}
            className={cn(
              i === 0 && "mt-3 border-t-2 border-border pt-1",
              i === 0 &&
                tabular &&
                "@lg:mt-0 @lg:border-t-0 @lg:pt-0",
              tabular && "@lg:border-l @lg:border-border @lg:pl-5",
            )}
          >
            {tabular && <ColumnHeading />}
            {/* Nested so :first-child means the first ROW, not the heading. */}
            <div
              className={cn(
                i === 0
                  ? "[&>*:first-child]:border-t-0"
                  : tabular && "@lg:[&>*:first-child]:border-t-0",
              )}
            >
              {rows.map((row) => (
                <NutrientRow key={row.key} row={row} tabular={tabular} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Minerals, below the closing section rule: full-width rows when stacked,
          a single inline run across the foot in tabular — where the real label
          puts them. Only the catalog side ever has these. */}
      {micros.length > 0 && (
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
      )}
    </div>
  );
}
