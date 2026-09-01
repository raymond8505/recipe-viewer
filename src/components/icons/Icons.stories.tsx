import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as Icons from "@/components/icons";
import { iconRegistry } from "./registry";

const meta: Meta = {
  title: "Components/Icons",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

const registered = new Set<string>(iconRegistry.map((entry) => entry.name));
const unregistered = Object.keys(Icons).filter((name) => !registered.has(name));

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </th>
  );
}

/**
 * Every icon the app ships, sourced from the barrel rather than a hand-written
 * list so a new icon can't quietly miss the table the way the old grid missed
 * ImageIcon and WarningIcon. Rows come from the registry; anything exported but
 * unregistered is called out above the table (and fails `icons.test.tsx`).
 */
export const IconTable: Story = {
  render: () => (
    <div className="space-y-4">
      {unregistered.length > 0 && (
        <p className="rounded-lg border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Exported but missing from <code>registry.ts</code>: {unregistered.join(", ")}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Icon</Th>
              <Th>Name</Th>
              <Th>Lucide</Th>
              <Th>Size</Th>
              <Th>Used in</Th>
            </tr>
          </thead>
          <tbody>
            {iconRegistry.map(({ name, component: Icon, lucide, size, usedIn }) => (
              <tr key={name} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2">
                  <span className="flex h-12 w-12 items-center justify-center text-gray-700">
                    <Icon />
                  </span>
                </td>
                <td className="px-3 py-2 font-medium text-card-foreground">{name}</td>
                <td className="px-3 py-2 text-muted-foreground">{lucide}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{size}</td>
                <td className="px-3 py-2 text-muted-foreground">{usedIn.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ),
};
