import { formatNutrientDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LabelData, LabelRow } from "./labelRows";

// Responsive arrangement (grid/flex) goes only on the plain-div wrappers AROUND
// the tables below, never on a table-internal element (`<table>`/`<tbody>`/
// `<tr>`/`<td>`) — overriding `display` on those strips their implicit
// table/row/cell roles in some browsers (notably Safari/VoiceOver).
//
// Row hairlines rely on Tailwind Preflight's global `border-collapse: collapse`;
// if that default is ever overridden in globals.css they visibly double up.

/** Eyebrow labels, in the site's uppercase-tracked sans. */
const EYEBROW =
  "font-sans text-[10px] font-semibold uppercase tracking-widest text-muted-foreground";

/** Grid template per number of rendered blocks; the serving/Calories block
 *  always counts, so this only varies with how many nutrient groups survive. */
const GRID_COLUMNS: Record<number, string> = {
  2: "@lg:grid @lg:grid-cols-[auto_1fr] @lg:gap-x-5",
  3: "@lg:grid @lg:grid-cols-[auto_1fr_1fr] @lg:gap-x-5",
};

function NutrientRowTr({ row, tabular }: { row: LabelRow; tabular: boolean }) {
  return (
    <tr>
      <th
        scope="row"
        className={cn(
          // `<th>` defaults to font-weight: bold, so font-light is what
          // restores the body's ambient weight — only font-semibold stands out.
          "border-t border-border py-1 text-left align-baseline text-sm font-light pl-2",
          !row.sub && "font-semibold",
          row.sub && "pl-4",
        )}
      >
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
      </th>
      <td className="border-t border-border py-1 text-right align-baseline text-sm tabular-nums">
        {formatNutrientDisplay(row.value!)}
      </td>
    </tr>
  );
}

/**
 * A Nutrition Facts label, in the FDA's arrangement and the site's styling.
 *
 * Purely presentational: the rows arrive already scaled to the serving
 * `servingLabel` names, and nutrients the source doesn't carry are already
 * `null` — there is no math and no fetching here.
 */
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

  // A group that loses every row isn't rendered at all, so its rule and (in
  // tabular) its column go with it — hence the block count driving GRID_COLUMNS.
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
        {/* Block 1 — serving basis and Calories. Plain divs, not a table: a
            zero-or-one serving line plus one specially-styled display number,
            not repeating row data. */}
        <div>
          <div className="flex items-baseline justify-between gap-2 text-sm font-semibold">
            {servingCaption && (
              <span className="text-muted-foreground">{servingCaption}</span>
            )}
            <span className={cn(servingCaption && "text-right")}>
              {servingLabel}
            </span>
          </div>
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

        {/* Stacked, the groups read as one continuous list, so only the first
            carries the section rule and only the first suppresses its leading
            hairline; as columns each gets a left divider, and the second
            suppresses its hairline too since a heading rule sits above. */}
        {groups.map((rows, i) => (
          <table
            key={rows[0].key}
            className={cn(
              "w-full",
              i === 0 && "mt-3 border-t-2 border-border pt-1",
              i === 0 && tabular && "@lg:mt-0 @lg:border-t-0 @lg:pt-0",
              tabular && "@lg:border-l @lg:border-border @lg:pl-5",
            )}
          >
            {tabular && (
              <caption
                className={cn(
                  "hidden @lg:table-caption border-b border-border pb-1 text-left",
                  EYEBROW,
                )}
              >
                Amount/serving
              </caption>
            )}
            {/* Retargeted at the first row's own cells, since a <tr> doesn't
                paint a border independently of its cells. */}
            <tbody
              className={cn(
                i === 0
                  ? "[&>tr:first-child>th]:border-t-0 [&>tr:first-child>td]:border-t-0"
                  : tabular &&
                      "@lg:[&>tr:first-child>th]:border-t-0 @lg:[&>tr:first-child>td]:border-t-0",
              )}
            >
              {rows.map((row) => (
                <NutrientRowTr key={row.key} row={row} tabular={tabular} />
              ))}
            </tbody>
          </table>
        ))}
      </div>

      {/* Minerals: full-width rows when stacked, a single wrapping run across
          the foot in tabular. Each is its own single-row <table> so the flex
          wrapping happens BETWEEN tables — see the display note up top. */}
      {micros.length > 0 && (
        <div className="mt-3 border-t-2 border-border">
          <div
            className={cn(
              "[&>table:first-child_th]:border-t-0 [&>table:first-child_td]:border-t-0",
              tabular &&
                "@lg:flex @lg:flex-wrap @lg:gap-x-8 @lg:[&_th]:border-t-0 @lg:[&_td]:border-t-0 @lg:[&_td]:pl-2",
            )}
          >
            {micros.map((row) => (
              <table key={row.key} className="w-full @lg:w-auto">
                <tbody>
                  <NutrientRowTr row={row} tabular={tabular} />
                </tbody>
              </table>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
