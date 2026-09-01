import { formatNutrientDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LabelRow } from "./labelRows";

/**
 * One nutrient line of a Nutrition Facts label: name in a row header, amount in
 * the cell beside it.
 *
 * Renders a bare `<tr>`, so it must be placed inside a `<tbody>` — see
 * NutritionFactsLabel, which is the only caller. It deliberately takes no
 * `className`: the parent styles rows through its `<tbody>` (the first row's
 * hairline suppression, the minerals run) rather than per row, and a
 * display-changing class here would strip the row's implicit table role.
 *
 * `tabular` swaps in the FDA's abbreviations once there's room. That switch is
 * a CONTAINER query, so it resolves against the nearest `@container` ancestor —
 * the label's own wrapper. Rendered outside one (a story, an isolated test) the
 * `@lg:` half never matches and the full names show.
 */
export default function NutrientRowTr({
  row,
  tabular,
}: {
  /** A tracked row: `value` is non-null, since the label drops untracked ones. */
  row: LabelRow;
  /** Whether the parent is in its tabular layout. */
  tabular: boolean;
}) {
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
